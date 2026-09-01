import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const EXPORT_TOKEN_PREFIX = "fqex_";

export function hashExportToken(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}

export function generateExportToken(): { token: string; prefix: string; hash: string } {
  const token = `${EXPORT_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
  return {
    token,
    prefix: token.slice(0, 12),
    hash: hashExportToken(token),
  };
}

export function hashesMatch(presentedHash: string, storedHash: string): boolean {
  const a = Buffer.from(presentedHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== 32 || b.length !== 32) return false;
  return timingSafeEqual(a, b);
}

export function extractExportToken(authHeader?: string, apiKeyHeader?: string): string {
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const key = (apiKeyHeader || "").trim();
  const token = bearer || key;
  if (!token.startsWith(EXPORT_TOKEN_PREFIX) || token.length < 20) {
    throw Object.assign(new Error("Token inválido."), { status: 401 });
  }
  return token;
}
