import { Bug } from "../types";
import { isSlaBreached } from "./cardAge";

export type PulseKind = "all" | "open" | "blockers" | "overdue";

export type PulseCounts = { open: number; blockers: number; overdue: number };

export type PulseBug = Pick<
  Bug,
  "id" | "warRoomId" | "status" | "criticism" | "createdAt" | "ownerId" | "archived"
>;

export function dashboardPulse(bugs: PulseBug[]): PulseCounts {
  const openBugs = bugs.filter((bug) => bug.status !== "validated");
  return {
    open: openBugs.length,
    blockers: openBugs.filter((bug) => bug.criticism === "blocker").length,
    overdue: openBugs.filter((bug) => isSlaBreached(bug)).length,
  };
}

export function parsePulseKind(value: string | null | undefined): PulseKind {
  if (value === "open" || value === "blockers" || value === "overdue") return value;
  return "all";
}

export function bugMatchesPulse(bug: PulseBug, kind: PulseKind): boolean {
  if (kind === "all") return true;
  if (bug.status === "validated") return false;
  if (kind === "open") return true;
  if (kind === "blockers") return bug.criticism === "blocker";
  return isSlaBreached(bug);
}

export function pulseMatchesCounts(pulse: PulseCounts, kind: PulseKind): boolean {
  if (kind === "all") return true;
  if (kind === "open") return pulse.open > 0;
  if (kind === "blockers") return pulse.blockers > 0;
  return pulse.overdue > 0;
}

export function comparePulseActivity(a: PulseCounts, b: PulseCounts): number {
  if (b.blockers !== a.blockers) return b.blockers - a.blockers;
  if (b.overdue !== a.overdue) return b.overdue - a.overdue;
  return b.open - a.open;
}

/** Up to three facts for the room header (open / blockers / overdue / unassigned). */
export function roomHeadlineParts(bugs: PulseBug[]): string[] {
  const pulse = dashboardPulse(bugs);
  const unassigned = bugs.filter((bug) => !bug.ownerId && bug.status !== "validated").length;
  const reopened = bugs.filter((bug) => bug.status === "reopened").length;
  const parts: string[] = [`${pulse.open} abertos`];
  if (pulse.blockers > 0) {
    parts.push(`${pulse.blockers} ${pulse.blockers === 1 ? "blocker" : "blockers"}`);
  }
  if (pulse.overdue > 0) parts.push(`${pulse.overdue} atrasados`);
  if (parts.length < 3 && unassigned > 0) parts.push(`${unassigned} sem responsável`);
  if (parts.length < 3 && reopened > 0) parts.push(`${reopened} reabertos`);
  return parts.slice(0, 3);
}
