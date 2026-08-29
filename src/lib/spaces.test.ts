import { describe, expect, it } from "vitest";
import { BoardView, Project, WarRoom } from "../types";
import {
  buildSpaces,
  decorateSpaces,
  groupSpacesByProject,
  railVisibleSpaces,
  spaceGroupKey,
  UNGROUPED_PROJECT_LABEL,
} from "./spaces";

function room(partial: Partial<WarRoom> & Pick<WarRoom, "id" | "name">): WarRoom {
  return {
    project: "",
    squad: "QA",
    date: "",
    description: "",
    severity: "medium",
    status: "active",
    roomType: "war_room",
    createdAt: "",
    createdBy: "u1",
    ...partial,
  };
}

function project(partial: Partial<Project> & Pick<Project, "id" | "name" | "warRoomId">): Project {
  return {
    slug: partial.name.toLowerCase(),
    squad: "QA",
    description: "",
    createdAt: "",
    createdBy: "u1",
    ...partial,
  };
}

describe("spaces", () => {
  it("builds war rooms and project boards", () => {
    const views: BoardView[] = [
      {
        id: "v1",
        name: "Bugs",
        slug: "bugs",
        isActive: true,
        orderIndex: 0,
        filters: {},
        projectId: "p1",
        createdAt: "",
      },
    ];
    const spaces = buildSpaces(
      [room({ id: "r1", name: "Sessão 1", project: "Checkout", roomType: "war_room" })],
      [project({ id: "p1", name: "Checkout", warRoomId: "board-1" })],
      views
    );
    expect(spaces).toHaveLength(2);
    expect(spaces.find((s) => s.kind === "board")?.viewCount).toBe(1);
    expect(spaces.find((s) => s.kind === "war_room")?.projectLabel).toBe("Checkout");
  });

  it("groups by project, pins active war rooms, hides ended from the rail", () => {
    const decorated = decorateSpaces(
      [
        {
          key: "a",
          roomId: "active",
          name: "War ativa",
          squad: "QA",
          projectLabel: "Checkout",
          kind: "war_room",
          status: "active",
        },
        {
          key: "e",
          roomId: "ended",
          name: "War velha",
          squad: "QA",
          projectLabel: "Checkout",
          kind: "war_room",
          status: "ended",
        },
        {
          key: "b",
          roomId: "board",
          name: "Checkout",
          squad: "QA",
          kind: "board",
        },
        {
          key: "l",
          roomId: "loose",
          name: "Avulsa",
          squad: "QA",
          kind: "war_room",
          status: "paused",
        },
      ],
      []
    );

    const groups = groupSpacesByProject(decorated);
    expect(groups[0].title).toBe("Checkout");
    expect(groups[0].pinned).toBe(true);
    expect(groups[0].items.map((i) => i.space.roomId)).toEqual(["active", "board", "ended"]);
    expect(groups[1].title).toBe(UNGROUPED_PROJECT_LABEL);
    expect(spaceGroupKey(groups[1].items[0].space)).toBe(UNGROUPED_PROJECT_LABEL);

    const rail = railVisibleSpaces(decorated, null);
    expect(rail.map((i) => i.space.roomId)).not.toContain("ended");
    expect(railVisibleSpaces(decorated, "ended").map((i) => i.space.roomId)).toContain("ended");
  });
});
