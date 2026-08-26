import { Bug } from "../types";
import { isSlaBreached } from "./cardAge";

export function dashboardPulse(bugs: Bug[]): { open: number; blockers: number; overdue: number } {
  const openBugs = bugs.filter((bug) => bug.status !== "validated");
  return {
    open: openBugs.length,
    blockers: openBugs.filter((bug) => bug.criticism === "blocker").length,
    overdue: openBugs.filter((bug) => isSlaBreached(bug)).length,
  };
}
