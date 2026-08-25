import { describe, expect, it } from "vitest";
import {
  createCustomKanbanColumn,
  displayColumnLabel,
  DEFAULT_KANBAN_COLUMNS,
  groupBugsByColumn,
  resolveBugColumnId,
  resolveKanbanColumns,
} from "./kanbanColumns";
import { Bug } from "../types";

function bug(partial: Partial<Bug> & Pick<Bug, "id" | "status">): Bug {
  return {
    warRoomId: "room-1",
    title: "Card",
    description: "",
    criticism: "medium",
    ownerId: null,
    ownerName: null,
    environment: "dev",
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

describe("kanbanColumns", () => {
  it("injects the reopened column on legacy boards", () => {
    const legacy = DEFAULT_KANBAN_COLUMNS.filter((c) => c.id !== "reopened");
    const resolved = resolveKanbanColumns(legacy);
    const reopenedIdx = resolved.findIndex((c) => c.id === "reopened");
    const validatedIdx = resolved.findIndex((c) => c.id === "validated");
    expect(reopenedIdx).toBeGreaterThan(-1);
    expect(reopenedIdx).toBeLessThan(validatedIdx);
  });

  it("uses stored columns when reopened already exists", () => {
    expect(resolveKanbanColumns(DEFAULT_KANBAN_COLUMNS)).toHaveLength(DEFAULT_KANBAN_COLUMNS.length);
  });

  it("falls back to status when kanbanColumnId is missing", () => {
    const columns = resolveKanbanColumns(null);
    expect(resolveBugColumnId(bug({ id: "1", status: "ready_for_qa" }), columns)).toBe("ready_for_qa");
  });

  it("groups bugs by resolved column", () => {
    const columns = resolveKanbanColumns(null);
    const grouped = groupBugsByColumn(
      [
        bug({ id: "1", status: "new" }),
        bug({ id: "2", status: "reopened" }),
        bug({ id: "3", status: "validated" }),
      ],
      columns
    );
    expect(grouped.new).toHaveLength(1);
    expect(grouped.reopened).toHaveLength(1);
    expect(grouped.validated).toHaveLength(1);
  });

  it("creates a custom column with unused color", () => {
    const col = createCustomKanbanColumn("fila extra", DEFAULT_KANBAN_COLUMNS);
    expect(col.builtin).toBe(false);
    expect(col.label).toBe("fila extra");
    expect(col.id.startsWith("col_")).toBe(true);
  });

  it("shows readable labels for stored uppercase columns", () => {
    expect(displayColumnLabel({ id: "new", label: "NOVO INCIDENTE", status: "new", builtin: true })).toBe("Novo");
  });
});
