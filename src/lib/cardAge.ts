import { Bug } from "../types";

export function hoursOpen(createdAt: unknown): number {
  const d = new Date(createdAt as string | number | Date);
  if (Number.isNaN(d.getTime())) return 0;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60);
}

export function formatOpenAge(createdAt: unknown): string {
  const hours = hoursOpen(createdAt);
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

export function isSlaBreached(bug: Pick<Bug, "criticism" | "status" | "createdAt">): boolean {
  if (bug.status === "validated") return false;
  const hours = hoursOpen(bug.createdAt);
  if (bug.criticism === "blocker") return hours > 4;
  if (bug.criticism === "critical") return hours > 8;
  return hours > 24;
}
