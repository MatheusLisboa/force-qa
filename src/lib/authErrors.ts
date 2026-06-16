export function getAuthErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const e = err as Record<string, unknown>;
  return String(e.code || e.error_code || "");
}

export function getAuthErrorMessage(err: unknown): string {
  if (!err || typeof err !== "object") return String(err ?? "Erro desconhecido");
  const e = err as Record<string, unknown>;
  return String(e.message || e.msg || e.error_description || "Erro desconhecido");
}

export function isUserAlreadyRegistered(err: unknown): boolean {
  const code = getAuthErrorCode(err);
  const msg = getAuthErrorMessage(err).toLowerCase();
  return code === "user_already_exists" || msg.includes("already registered");
}
