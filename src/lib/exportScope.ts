/**
 * Escopo do token de extração: `null` = todas as salas da organização; lista = só estas.
 * Lista vazia NÃO significa "tudo": significa "nenhuma sala" (falha fechada).
 */
export type ExportScope = string[] | null;

export function normalizeExportScope(input: unknown): ExportScope {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input)) return null;
  const ids = input.map((item) => String(item ?? "").trim()).filter(Boolean);
  return [...new Set(ids)];
}

export function isRoomInExportScope(roomId: string, scope: ExportScope): boolean {
  return scope === null || scope.includes(roomId);
}

export function describeExportScope(scope: ExportScope, roomNames: Record<string, string> = {}): string {
  if (scope === null) return "Todas as salas da organização";
  if (scope.length === 0) return "Nenhuma sala";
  const names = scope.map((id) => roomNames[id] || id);
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} e mais ${names.length - 3}`;
}
