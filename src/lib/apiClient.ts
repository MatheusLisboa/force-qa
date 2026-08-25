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
  const errData = await response.json().catch(() => ({} as { error?: string }));
  return (errData && typeof errData === "object" && "error" in errData && errData.error)
    ? String(errData.error)
    : fallback;
}
