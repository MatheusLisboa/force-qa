import { describe, expect, it } from "vitest";
import { leftoverOpenBugs } from "./endWarRoom";
import { Bug } from "../types";

function stub(overrides: Partial<Bug>): Bug {
  return {
    id: "1",
    warRoomId: "room",
    title: "t",
    description: "",
    criticism: "medium",
    status: "new",
    ownerId: null,
    ownerName: null,
    environment: "dev",
    tags: [],
    priority: "medium",
    type: "bug",
    createdAt: "",
    updatedAt: "",
    createdBy: "u",
    createdByName: "U",
    ...overrides,
  };
}

describe("leftoverOpenBugs", () => {
  it("keeps open cards and drops validated or archived", () => {
    expect(
      leftoverOpenBugs([
        stub({ id: "a", status: "in_progress" }),
        stub({ id: "b", status: "validated" }),
        stub({ id: "c", status: "new", archived: true }),
        stub({ id: "d", status: "ready_for_qa" }),
      ]).map((bug) => bug.id)
    ).toEqual(["a", "d"]);
  });
});
