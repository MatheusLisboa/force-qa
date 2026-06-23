import { Bug, BoardView, BoardViewFilters, SeverityLevel } from "../types";

const TYPE_ALIASES: Record<string, string> = {
  requirement: "improvement",
};

function normalizeType(type: string): string {
  return TYPE_ALIASES[type] ?? type;
}

function itemSeverity(item: Pick<Bug, "criticism">): SeverityLevel | undefined {
  return item.criticism;
}

export const ACTIVE_BOARD_VIEW_STORAGE_KEY = "activeBoardView";

export function slugifyBoardViewName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function filterItemsByView<T extends Pick<Bug, "type" | "status" | "criticism">>(
  items: T[],
  view: BoardView | null | undefined
): T[] {
  if (!view) return items;

  const f: BoardViewFilters = view.filters || {};

  return items.filter((item) => {
    if (f.types?.length) {
      const allowed = f.types.map(normalizeType);
      if (!allowed.includes(item.type) && !f.types.includes(item.type)) return false;
    }
    if (f.statuses?.length && !f.statuses.includes(item.status)) return false;
    const severity = itemSeverity(item);
    if (f.severity?.length && severity && !f.severity.includes(severity)) return false;
    return true;
  });
}

export function boardViewStorageKey(projectId: string): string {
  return `${ACTIVE_BOARD_VIEW_STORAGE_KEY}:${projectId}`;
}

export function readStoredBoardViewId(projectId?: string | null): string | null {
  try {
    const key = projectId ? boardViewStorageKey(projectId) : ACTIVE_BOARD_VIEW_STORAGE_KEY;
    const raw = localStorage.getItem(key);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function writeStoredBoardViewId(
  projectId: string | null | undefined,
  viewId: string | null
): void {
  try {
    const key = projectId ? boardViewStorageKey(projectId) : ACTIVE_BOARD_VIEW_STORAGE_KEY;
    if (!viewId) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, viewId);
  } catch {
    /* ignore quota / private mode */
  }
}
