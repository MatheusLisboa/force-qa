import { Bug, BugStatus, SeverityLevel, WarRoom } from "../../types";
import { BoardReportMetrics, TrendDirection } from "./types";

function emptySeverityCounts(): Record<SeverityLevel, number> {
  return { blocker: 0, critical: 0, high: 0, medium: 0, low: 0 };
}

function emptyStatusCounts(): Record<BugStatus, number> {
  return {
    new: 0,
    under_analysis: 0,
    in_progress: 0,
    ready_for_qa: 0,
    validated: 0,
    reopened: 0,
  };
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string | number | Date);
  return Number.isNaN(d.getTime()) ? null : d;
}

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function trend(current: number, previous: number): TrendDirection {
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "stable";
}

function countInRange(bugs: Bug[], start: Date, end: Date, field: "created" | "resolved"): number {
  return bugs.filter((bug) => {
    const raw = field === "created" ? bug.createdAt : bug.resolvedAt;
    const d = toDate(raw);
    if (!d) return false;
    return d >= start && d < end;
  }).length;
}

export function aggregateBoardMetrics(warRoom: WarRoom, bugs: Bug[]): BoardReportMetrics {
  const now = new Date();
  const periodDays = 7 as const;
  const last7Start = new Date(now);
  last7Start.setDate(last7Start.getDate() - periodDays);
  const prev7Start = new Date(last7Start);
  prev7Start.setDate(prev7Start.getDate() - periodDays);

  const bySeverity = emptySeverityCounts();
  const byStatus = emptyStatusCounts();
  const byType: Record<string, number> = {};
  const byEnvironment: Record<string, number> = {};
  const tagCounts = new Map<string, number>();
  const assigneeMap = new Map<string, { open: number; validated: number }>();

  const resolutionHours: number[] = [];

  for (const bug of bugs) {
    bySeverity[bug.criticism]++;
    byStatus[bug.status]++;
    byType[bug.type] = (byType[bug.type] || 0) + 1;
    byEnvironment[bug.environment] = (byEnvironment[bug.environment] || 0) + 1;

    for (const tag of bug.tags || []) {
      const key = tag.toLowerCase();
      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
    }

    const assignee = bug.ownerName?.trim() || "Sem responsável";
    const entry = assigneeMap.get(assignee) || { open: 0, validated: 0 };
    if (bug.status === "validated") entry.validated++;
    else entry.open++;
    assigneeMap.set(assignee, entry);

    const created = toDate(bug.createdAt);
    const resolved = toDate(bug.resolvedAt);
    if (created && resolved && bug.status === "validated") {
      resolutionHours.push(hoursBetween(created, resolved));
    }
  }

  const openBugs = bugs.filter((b) => b.status !== "validated");
  const validatedBugs = bugs.filter((b) => b.status === "validated");
  const reopenedBugs = bugs.filter((b) => b.status === "reopened" || (b.reopenCount || 0) > 0);

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  const topBlockers = bugs
    .filter((b) => b.criticism === "blocker" || b.criticism === "critical")
    .sort((a, b) => {
      const sev = { blocker: 0, critical: 1, high: 2, medium: 3, low: 4 };
      const diff = sev[a.criticism] - sev[b.criticism];
      if (diff !== 0) return diff;
      const aDate = toDate(a.createdAt)?.getTime() || 0;
      const bDate = toDate(b.createdAt)?.getTime() || 0;
      return aDate - bDate;
    })
    .slice(0, 5)
    .map((bug) => {
      const created = toDate(bug.createdAt);
      const daysOpen = created
        ? Math.max(1, Math.round(hoursBetween(created, now) / 24))
        : 0;
      return { id: bug.id, title: bug.title, status: bug.status, daysOpen };
    });

  const assigneeLoad = [...assigneeMap.entries()]
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.open - a.open || b.validated - a.validated)
    .slice(0, 8);

  const createdLast7 = countInRange(bugs, last7Start, now, "created");
  const resolvedLast7 = countInRange(bugs, last7Start, now, "resolved");
  const createdPrev7 = countInRange(bugs, prev7Start, last7Start, "created");
  const resolvedPrev7 = countInRange(bugs, prev7Start, last7Start, "resolved");

  const validationRate = bugs.length > 0 ? validatedBugs.length / bugs.length : 0;

  return {
    board: {
      id: warRoom.id,
      name: warRoom.name,
      project: warRoom.project,
      squad: warRoom.squad,
      roomType: warRoom.roomType,
      status: warRoom.status,
      severity: warRoom.severity,
      description: warRoom.description || "",
    },
    generatedAt: now.toISOString(),
    periodDays,
    totals: {
      bugs: bugs.length,
      open: openBugs.length,
      validated: validatedBugs.length,
      reopened: reopenedBugs.length,
      unassigned: bugs.filter((b) => !b.ownerId && b.status !== "validated").length,
    },
    bySeverity,
    byStatus,
    bySquad: { [warRoom.squad || "Sem squad"]: bugs.length },
    byType,
    byEnvironment,
    topTags,
    topBlockers,
    resolution: {
      avgHours:
        resolutionHours.length > 0
          ? Math.round(
              (resolutionHours.reduce((s, v) => s + v, 0) / resolutionHours.length) * 10
            ) / 10
          : null,
      medianHours:
        median(resolutionHours) !== null
          ? Math.round(median(resolutionHours)! * 10) / 10
          : null,
      validatedCount: validatedBugs.length,
      validationRate: Math.round(validationRate * 1000) / 1000,
    },
    last7Days: {
      created: createdLast7,
      resolved: resolvedLast7,
      netChange: createdLast7 - resolvedLast7,
    },
    previous7Days: {
      created: createdPrev7,
      resolved: resolvedPrev7,
    },
    trends: {
      createdTrend: trend(createdLast7, createdPrev7),
      resolvedTrend: trend(resolvedLast7, resolvedPrev7),
      backlogTrend: trend(openBugs.length, openBugs.length + resolvedLast7 - createdLast7),
    },
    assigneeLoad,
  };
}
