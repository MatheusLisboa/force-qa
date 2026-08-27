/** Áreas mais comuns no dia a dia de QA. Quem precisar de outro nome usa “Outra”. */
export const SQUAD_PRESETS = [
  "QA",
  "Dev",
  "Produto",
  "Requisitos",
  "IHC",
  "DevOps",
  "DBA",
] as const;

export type SquadPreset = (typeof SQUAD_PRESETS)[number];

export function isKnownSquad(value: string): boolean {
  return SQUAD_PRESETS.some((s) => s.toLowerCase() === value.trim().toLowerCase());
}
