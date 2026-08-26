import { supabase } from "./supabase";

export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${session.access_token}`);

  return fetch(input, { ...init, headers });
}

export async function readApiError(response: Response, fallback: string): Promise<string> {
  const errData = await response.json().catch(() => null);
  const message = extractApiErrorMessage(errData);
  return message || fallback;
}

function extractApiErrorMessage(errData: unknown): string | null {
  if (!errData || typeof errData !== "object") return null;
  const error = (errData as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object") {
    const nested = error as { message?: unknown; code?: unknown };
    if (typeof nested.message === "string" && nested.message.trim()) return nested.message;
    if (typeof nested.code === "string" && nested.code === "FUNCTION_INVOCATION_FAILED") {
      return "Falha no servidor. Tente de novo em instantes.";
    }
  }
  return null;
}
