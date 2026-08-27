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

const LEGACY_AREA_MAP: Record<string, SquadPreset> = {
  "squad pix": "Produto",
  pix: "Produto",
  "squad checkout": "Produto",
  checkout: "Produto",
  "squad core": "Dev",
  core: "Dev",
};

export function isKnownSquad(value: string): boolean {
  return SQUAD_PRESETS.some((s) => s.toLowerCase() === value.trim().toLowerCase());
}

/** Maps legacy squad names onto the current área presets without a DB migration. */
export function normalizeArea(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const preset = SQUAD_PRESETS.find((s) => s.toLowerCase() === trimmed.toLowerCase());
  if (preset) return preset;
  return LEGACY_AREA_MAP[trimmed.toLowerCase()] ?? trimmed;
}
