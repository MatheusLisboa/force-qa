import { Bug } from "../types";

export type LeftoverAction = "keep" | "move" | "archive";

export function leftoverOpenBugs(bugs: Bug[]): Bug[] {
  return bugs.filter((bug) => !bug.archived && bug.status !== "validated");
}
