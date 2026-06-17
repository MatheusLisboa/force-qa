export function envVar(key: string): string | undefined {
  const raw = process.env[key];
  if (!raw) return undefined;
  return raw.trim().replace(/^["']|["']$/g, "");
}
