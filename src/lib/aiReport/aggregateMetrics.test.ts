import { describe, expect, it } from "vitest";
import { aggregateBoardMetrics } from "./aggregateMetrics";
import { Bug, WarRoom } from "../../types";

const room: WarRoom = {
  id: "room-1",
  name: "Checkout",
  project: "App",
  squad: "Pix",
  date: "2026-01-01",
  description: "",
  severity: "high",
  status: "active",
  roomType: "war_room",
  createdAt: "2026-01-01T00:00:00.000Z",
  createdBy: "u1",
};

function bug(partial: Partial<Bug> & Pick<Bug, "id" | "status" | "criticism">): Bug {
  return {
    warRoomId: room.id,
    title: "Card",
    description: "",
    ownerId: null,
    ownerName: null,
    environment: "production",
    tags: [],
    priority: "medium",
    type: "bug",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "u1",
    createdByName: "QA",
    ...partial,
  };
}

describe("aggregateBoardMetrics", () => {
  it("counts open, validated and unassigned cards", () => {
    const metrics = aggregateBoardMetrics(room, [
      bug({ id: "1", status: "new", criticism: "blocker" }),
      bug({
        id: "2",
        status: "validated",
        criticism: "low",
        ownerId: "dev",
        ownerName: "Dev",
        resolvedAt: "2026-01-02T00:00:00.000Z",
      }),
      bug({ id: "3", status: "reopened", criticism: "critical", reopenCount: 1, ownerId: "dev", ownerName: "Dev" }),
    ]);

    expect(metrics.totals.bugs).toBe(3);
    expect(metrics.totals.open).toBe(2);
    expect(metrics.totals.validated).toBe(1);
    expect(metrics.totals.reopened).toBe(1);
    expect(metrics.totals.unassigned).toBe(1);
    expect(metrics.bySeverity.blocker).toBe(1);
    expect(metrics.byStatus.reopened).toBe(1);
    expect(metrics.resolution.validatedCount).toBe(1);
    expect(metrics.resolution.avgHours).toBe(24);
  });
});
