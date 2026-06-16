import { BugType } from "../types";

export interface BugTypeConfig {
  label: string;
  className: string;
}

export const BUG_TYPE_CONFIG: Record<BugType, BugTypeConfig> = {
  bug: {
    label: "Bug",
    className: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  },
  improvement: {
    label: "Melhoria",
    className: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  },
  ui_adjustment: {
    label: "UI/Visual",
    className: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  },
  performance: {
    label: "Performance",
    className: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  },
  security: {
    label: "Segurança",
    className: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  },
};

export function getBugTypeConfig(type: BugType): BugTypeConfig {
  return BUG_TYPE_CONFIG[type];
}

export function getBugTypeLabel(type: BugType): string {
  return BUG_TYPE_CONFIG[type].label;
}

export function truncateForLog(text: string, max = 80): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max) + "…";
}
