import { BugStatus, SeverityLevel, WarRoom } from "../../types";

export type TrendDirection = "up" | "down" | "stable";

export interface BoardReportMetrics {
  board: {
    id: string;
    name: string;
    project: string;
    squad: string;
    roomType: WarRoom["roomType"];
    status: WarRoom["status"];
    severity: WarRoom["severity"];
    description: string;
  };
  generatedAt: string;
  periodDays: 7;
  totals: {
    bugs: number;
    open: number;
    validated: number;
    reopened: number;
    unassigned: number;
  };
  bySeverity: Record<SeverityLevel, number>;
  byStatus: Record<BugStatus, number>;
  bySquad: Record<string, number>;
  byType: Record<string, number>;
  byEnvironment: Record<string, number>;
  topTags: { tag: string; count: number }[];
  topBlockers: { id: string; title: string; status: BugStatus; daysOpen: number }[];
  resolution: {
    avgHours: number | null;
    medianHours: number | null;
    validatedCount: number;
    validationRate: number;
  };
  last7Days: {
    created: number;
    resolved: number;
    netChange: number;
  };
  previous7Days: {
    created: number;
    resolved: number;
  };
  trends: {
    createdTrend: TrendDirection;
    resolvedTrend: TrendDirection;
    backlogTrend: TrendDirection;
  };
  assigneeLoad: { name: string; open: number; validated: number }[];
}

export interface AIExecutiveReport {
  markdown: string;
  generatedAt: string;
  provider: string;
  model: string;
}
