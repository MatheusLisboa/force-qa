/** Returns true when evidence should render as an image (base64 or direct image URL). */
export function isImageEvidence(url: string): boolean {
  if (url.startsWith("data:image/")) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?$/i.test(url);
}

/** Returns true for http(s) URLs (image or not). */
export function isHttpEvidence(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function evidenceLabel(url: string): "image" | "link" {
  if (isImageEvidence(url)) return "image";
  if (isHttpEvidence(url)) return "link";
  return "link";
}
