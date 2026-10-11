export type BackendHealth =
  | { status: "ok" }
  | { status: "unreachable" }
  | { status: "timeout" }
  | { status: "misconfigured"; reason: string };

/**
 * Pergunta ao Auth do Supabase se está de pé. Qualquer resposta HTTP (até 401) prova que
 * o projeto está vivo; falha de rede ou timeout indica projeto pausado, DNS ou bloqueio.
 */
export async function checkBackendHealth(options: {
  url: string;
  anonKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<BackendHealth> {
  const { url, anonKey, timeoutMs = 6000, fetchImpl = fetch } = options;
  if (!url || !anonKey || !url.startsWith("https://") || url.includes("placeholder") || anonKey === "placeholder") {
    return { status: "misconfigured", reason: "VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes neste deploy." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${url.replace(/\/$/, "")}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: controller.signal,
      cache: "no-store",
    });
    // 5xx do gateway também significa "indisponível".
    return response.status >= 500 ? { status: "unreachable" } : { status: "ok" };
  } catch (error) {
    return controller.signal.aborted ? { status: "timeout" } : { status: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
