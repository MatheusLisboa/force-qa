const NETWORK_PATTERNS = [
  /failed to fetch/i, // Chrome / Firefox
  /load failed/i, // Safari
  /networkerror/i, // Firefox
  /network request failed/i,
  /err_(internet_disconnected|name_not_resolved|connection)/i,
  /fetch failed/i, // Node
];

/** True quando a requisição nem chegou a ter resposta (rede caiu, DNS, bloqueio, projeto pausado). */
export function isNetworkError(err: unknown): boolean {
  if (!err) return false;
  const message =
    err instanceof Error ? err.message : typeof err === "object" ? String((err as { message?: unknown }).message ?? "") : String(err);
  const name = err instanceof Error ? err.name : "";
  // supabase-js embrulha como AuthRetryableFetchError (status 0) quando o fetch falha.
  if (name === "AuthRetryableFetchError") return true;
  if (typeof err === "object" && (err as { status?: unknown }).status === 0) return true;
  return NETWORK_PATTERNS.some((pattern) => pattern.test(message));
}

export const NETWORK_ERROR_MESSAGE =
  "Não foi possível falar com o servidor. Verifique sua conexão (ou bloqueadores e VPN) e tente de novo. Se persistir, o projeto pode estar pausado: avise um administrador.";

/** Mensagem amigável quando é erro de rede; senão devolve `fallback`. */
export function friendlyError(err: unknown, fallback: string): string {
  return isNetworkError(err) ? NETWORK_ERROR_MESSAGE : fallback;
}
