import { describe, expect, it } from "vitest";
import { Bug } from "../types";
import {
  bugMatchesPulse,
  comparePulseActivity,
  dashboardPulse,
  parsePulseKind,
  pulseMatchesCounts,
  roomHeadlineParts,
} from "./dashboardPulse";

function bug(partial: Partial<Bug> & Pick<Bug, "id" | "status" | "criticism">): Bug {
  return {
    warRoomId: "room-1",
    title: "Card",
    description: "",
    ownerId: null,
    ownerName: null,
    environment: "dev",
    tags: [],
    priority: "medium",
    type: "bug",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "u1",
    createdByName: "QA",
    ...partial,
  };
}

describe("dashboardPulse", () => {
  it("counts open, blocker and overdue cards", () => {
    const stale = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    const pulse = dashboardPulse([
      bug({ id: "1", status: "new", criticism: "blocker", createdAt: stale }),
      bug({ id: "2", status: "in_progress", criticism: "medium" }),
      bug({ id: "3", status: "validated", criticism: "blocker" }),
    ]);
    expect(pulse.open).toBe(2);
    expect(pulse.blockers).toBe(1);
    expect(pulse.overdue).toBe(1);
  });

  it("matches and sorts pulse filters", () => {
    const blocker = bug({ id: "1", status: "new", criticism: "blocker" });
    const open = bug({ id: "2", status: "in_progress", criticism: "medium" });
    const done = bug({ id: "3", status: "validated", criticism: "blocker" });
    expect(bugMatchesPulse(blocker, "blockers")).toBe(true);
    expect(bugMatchesPulse(open, "blockers")).toBe(false);
    expect(bugMatchesPulse(done, "open")).toBe(false);
    expect(parsePulseKind("blockers")).toBe("blockers");
    expect(parsePulseKind("nope")).toBe("all");
    expect(pulseMatchesCounts({ open: 2, blockers: 0, overdue: 1 }, "overdue")).toBe(true);
    expect(comparePulseActivity({ open: 9, blockers: 0, overdue: 0 }, { open: 1, blockers: 2, overdue: 0 })).toBeGreaterThan(0);
  });

  it("builds a short room headline", () => {
    const parts = roomHeadlineParts([
      bug({ id: "1", status: "new", criticism: "blocker", ownerId: null }),
      bug({ id: "2", status: "in_progress", criticism: "medium", ownerId: "u2" }),
    ]);
    expect(parts[0]).toBe("2 abertos");
    expect(parts).toContain("1 blocker");
  });
});
