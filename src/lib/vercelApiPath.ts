/** Tail after /api/<folder>/ for Vercel catch-all `[...path]` or a raw URL. */
export function apiPathTail(
  req: { query?: Record<string, unknown>; url?: string },
  folder: string
): string {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean).join("/");
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const url = String(req.url || "").split("?")[0];
  const marker = `/api/${folder}/`;
  const idx = url.indexOf(marker);
  if (idx >= 0) return url.slice(idx + marker.length).replace(/\/$/, "");
  return "";
}

export function wantsExportToken(
  req: { query?: Record<string, unknown>; url?: string }
): boolean {
  const tab = req.query?.tab;
  const value = Array.isArray(tab) ? String(tab[0] || "") : String(tab || "");
  if (value === "export-token") return true;
  return /org-export-token/.test(String(req.url || ""));
}
