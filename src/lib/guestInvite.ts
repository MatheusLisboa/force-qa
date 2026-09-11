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
