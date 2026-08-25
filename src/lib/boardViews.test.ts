import { describe, expect, it } from "vitest";
import { filterItemsByView, slugifyBoardViewName } from "./boardViews";
import { BoardView, Bug } from "../types";

const view = (filters: BoardView["filters"]): BoardView => ({
  id: "v1",
  projectId: "p1",
  name: "Bugs",
  slug: "bugs",
  isActive: true,
  orderIndex: 0,
  filters,
  createdAt: "2026-01-01T00:00:00.000Z",
});

describe("boardViews", () => {
  it("slugifies names without accents", () => {
    expect(slugifyBoardViewName("Bugs de Produção")).toBe("bugs-de-producao");
  });

  it("filters by type aliases and severity", () => {
    const items: Pick<Bug, "type" | "status" | "criticism">[] = [
      { type: "bug", status: "new", criticism: "high" },
      { type: "requisito" as Bug["type"], status: "new", criticism: "low" },
      { type: "requirement", status: "validated", criticism: "medium" },
    ];
    const filtered = filterItemsByView(items, view({ types: ["requirement"], severity: ["low"] }));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].type).toBe("requisito");
  });

  it("returns all items when view is null", () => {
    const items: Pick<Bug, "type" | "status" | "criticism">[] = [
      { type: "bug", status: "new", criticism: "high" },
    ];
    expect(filterItemsByView(items, null)).toEqual(items);
  });
});
