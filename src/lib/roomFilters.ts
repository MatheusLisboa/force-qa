const ENVS = ["production", "homologation", "dev"] as const;
const TYPES = ["bug", "requirement", "ihc", "product", "improvement", "ui_adjustment", "performance", "security"] as const;
const SEVERITIES = ["blocker", "critical", "high", "medium", "low"] as const;

export interface RoomFilters {
  q: string;
  env: string;
  type: string;
  severity: string;
  owner: string;
}

export const DEFAULT_ROOM_FILTERS: RoomFilters = { q: "", env: "all", type: "all", severity: "all", owner: "all" };

const PARAM_KEYS = { q: "q", env: "env", type: "type", severity: "sev", owner: "owner" } as const;

const pick = (value: string | null, allowed: readonly string[]) => (value && allowed.includes(value) ? value : "all");

/** Lê os filtros da query string, ignorando valores inválidos (a URL pode ser editada à mão). */
export function parseRoomFilters(search: string): RoomFilters {
  const params = new URLSearchParams(search);
  const owner = params.get(PARAM_KEYS.owner) || "all";
  return {
    q: (params.get(PARAM_KEYS.q) || "").slice(0, 100),
    env: pick(params.get(PARAM_KEYS.env), ENVS),
    type: pick(params.get(PARAM_KEYS.type), TYPES),
    severity: pick(params.get(PARAM_KEYS.severity), SEVERITIES),
    owner: owner === "unassigned" || /^[\w-]{1,64}$/.test(owner) ? owner : "all",
  };
}

/** Devolve a query string com os filtros aplicados, preservando os demais parâmetros (room, card, pulse…). */
export function applyRoomFilters(search: string, filters: RoomFilters): string {
  const params = new URLSearchParams(search);
  (Object.keys(PARAM_KEYS) as Array<keyof RoomFilters>).forEach((key) => {
    const value = filters[key];
    const isDefault = value === DEFAULT_ROOM_FILTERS[key];
    if (isDefault) params.delete(PARAM_KEYS[key]);
    else params.set(PARAM_KEYS[key], value);
  });
  const out = params.toString();
  return out ? `?${out}` : "";
}

export function hasActiveRoomFilters(filters: RoomFilters): boolean {
  return (Object.keys(DEFAULT_ROOM_FILTERS) as Array<keyof RoomFilters>).some((key) => filters[key] !== DEFAULT_ROOM_FILTERS[key]);
}
