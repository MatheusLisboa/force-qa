import type { Bug, SeverityLevel } from "../types";
import { isSlaBreached } from "./cardAge";

export interface WeekPoint {
  /** Início da semana (segunda, 00:00 local) em ISO. */
  start: string;
  label: string;
  created: number;
  resolved: number;
  /** Cards em aberto ao fim da semana. */
  backlog: number;
}

export interface TrendSummary {
  total: number;
  openNow: number;
  validated: number;
  /** Mediana, em horas, entre abrir e validar (só cards validados com data). */
  medianResolutionHours: number | null;
  /** Fração (0..1) dos cards que já foram reabertos ao menos uma vez. */
  reopenRate: number;
  slaBreachedOpen: number;
  openBySeverity: Record<SeverityLevel, number>;
  /** Cards sem responsável ainda abertos. */
  unassignedOpen: number;
}

export interface Trends {
  weeks: WeekPoint[];
  summary: TrendSummary;
}

const DAY = 86_400_000;

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - offset);
  return d;
}

function time(value: unknown): number | null {
  if (!value) return null;
  const t = new Date(value as string).getTime();
  return Number.isNaN(t) ? null : t;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function computeTrends(bugs: Bug[], options: { weeks?: number; now?: Date } = {}): Trends {
  const { weeks = 8, now = new Date() } = options;
  const lastStart = startOfWeek(now);
  const points: WeekPoint[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(lastStart);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const s = start.getTime();
    const e = end.getTime();

    let created = 0;
    let resolved = 0;
    let backlog = 0;
    for (const bug of bugs) {
      const c = time(bug.createdAt);
      const r = bug.status === "validated" ? time(bug.resolvedAt) : null;
      if (c !== null && c >= s && c < e) created++;
      if (r !== null && r >= s && r < e) resolved++;
      if (c !== null && c < e && (r === null || r >= e)) backlog++;
    }
    points.push({ start: start.toISOString(), label: `${pad(start.getDate())}/${pad(start.getMonth() + 1)}`, created, resolved, backlog });
  }

  const open = bugs.filter((b) => b.status !== "validated");
  const openBySeverity: Record<SeverityLevel, number> = { blocker: 0, critical: 0, high: 0, medium: 0, low: 0 };
  open.forEach((b) => {
    if (b.criticism in openBySeverity) openBySeverity[b.criticism]++;
  });

  const resolutionHours = bugs
    .filter((b) => b.status === "validated")
    .map((b) => {
      const c = time(b.createdAt);
      const r = time(b.resolvedAt);
      return c !== null && r !== null && r >= c ? (r - c) / (DAY / 24) : null;
    })
    .filter((v): v is number => v !== null);

  return {
    weeks: points,
    summary: {
      total: bugs.length,
      openNow: open.length,
      validated: bugs.length - open.length,
      medianResolutionHours: median(resolutionHours),
      reopenRate: bugs.length ? bugs.filter((b) => (b.reopenCount ?? 0) > 0 || b.status === "reopened").length / bugs.length : 0,
      slaBreachedOpen: open.filter((b) => isSlaBreached(b)).length,
      openBySeverity,
      unassignedOpen: open.filter((b) => !b.ownerId).length,
    },
  };
}

export function formatDuration(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} d`;
}
