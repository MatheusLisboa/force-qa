export const GUEST_TOKEN_PREFIX = "gst_";

export function generateGuestInviteToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  const token = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${GUEST_TOKEN_PREFIX}${token}`;
}

export function looksLikeGuestToken(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith(GUEST_TOKEN_PREFIX) && trimmed.length >= 20;
}

/** Validade do link de convidado, em dias. `null` = sem validade. */
export const INVITE_VALIDITY_OPTIONS: Array<{ days: number | null; label: string }> = [
  { days: 1, label: "24 horas" },
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: null, label: "Sem validade" },
];

export function inviteExpiryFromDays(days: number | null, now = new Date()): string | null {
  if (days === null) return null;
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

/** Sem data = não expira. */
export function isInviteExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return !Number.isNaN(t) && t <= now.getTime();
}

export function describeInviteExpiry(expiresAt: string | null | undefined, now = new Date()): string {
  if (!expiresAt) return "sem validade";
  if (isInviteExpired(expiresAt, now)) return "expirado";
  const hours = Math.round((new Date(expiresAt).getTime() - now.getTime()) / 3_600_000);
  if (hours < 48) return `expira em ${Math.max(hours, 1)} h`;
  return `expira em ${Math.round(hours / 24)} dias`;
}
