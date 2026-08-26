import { describe, expect, it } from "vitest";
import { Bug } from "../types";
import { dashboardPulse } from "./dashboardPulse";

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
});
