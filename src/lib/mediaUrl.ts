const STORAGE_OBJECT_RE = /\/storage\/v1\/object\/(?:public|sign)\/evidence\/([^?]+)/i;

export function storagePathFromUrl(url: string): string | null {
  const match = url.match(STORAGE_OBJECT_RE);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

/** https only. Rejects javascript:, data:, http:. Storage URLs (https) pass. */
export function safeMediaUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

export function isImageEvidence(url: string): boolean {
  const safe = safeMediaUrl(url);
  if (!safe) return false;
  if (storagePathFromUrl(safe)) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i.test(safe.split("?")[0]);
}

export function isHttpEvidence(url: string): boolean {
  return Boolean(safeMediaUrl(url));
}

export function evidenceLabel(url: string): "image" | "link" {
  if (isImageEvidence(url)) return "image";
  return "link";
}
