import { ReproItem } from "../types";

export const DEFAULT_BUG_REPRO: ReproItem[] = [
  { id: "steps", text: "Passos para reproduzir", done: false },
  { id: "expected", text: "Resultado esperado", done: false },
  { id: "actual", text: "Resultado atual", done: false },
];

export function parseReproChecklist(raw: unknown): ReproItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const text = String(row.text || "").trim();
      if (!text) return null;
      return {
        id: String(row.id || `item-${index}`),
        text,
        done: Boolean(row.done),
      };
    })
    .filter((item): item is ReproItem => Boolean(item));
}

export function reproForType(type: string): ReproItem[] {
  return type === "bug" ? DEFAULT_BUG_REPRO.map((item) => ({ ...item })) : [];
}
