/** Squads operacionais reconhecidas no ForceQA */
export const SQUAD_PRESETS = [
  "Requisitos",
  "IHC",
  "Produto",
  "Squad Core",
  "Squad Pix",
  "Squad Checkout",
  "Dev",
  "DBA",
  "DevOps",
  "QA",
] as const;

export type SquadPreset = (typeof SQUAD_PRESETS)[number];

export function isKnownSquad(value: string): boolean {
  return SQUAD_PRESETS.some((s) => s.toLowerCase() === value.trim().toLowerCase());
}
