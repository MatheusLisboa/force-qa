import { describe, expect, it } from "vitest";
import { applyRealtimeChange, isIncompleteRow } from "./realtime";

describe("realtime", () => {
  const getId = (item: { id: string; n?: number }) => item.id;

  it("inserts at the start and replaces duplicates", () => {
    const inserted = applyRealtimeChange([{ id: "a" }], "INSERT", { id: "b" }, getId);
    expect(inserted.map((i) => i.id)).toEqual(["b", "a"]);

    const replaced = applyRealtimeChange([{ id: "a", n: 1 }], "INSERT", { id: "a", n: 2 }, getId);
    expect(replaced).toEqual([{ id: "a", n: 2 }]);
  });

  it("updates in place or prepends unknown rows", () => {
    expect(applyRealtimeChange([{ id: "a", n: 1 }], "UPDATE", { id: "a", n: 9 }, getId)).toEqual([
      { id: "a", n: 9 },
    ]);
    expect(applyRealtimeChange([{ id: "a" }], "UPDATE", { id: "b" }, getId).map((i) => i.id)).toEqual([
      "b",
      "a",
    ]);
  });

  it("removes on delete", () => {
    expect(applyRealtimeChange([{ id: "a" }, { id: "b" }], "DELETE", { id: "a" }, getId)).toEqual([
      { id: "b" },
    ]);
  });

  it("detects incomplete replica payloads", () => {
    expect(isIncompleteRow({ id: "1" }, ["id", "title"])).toBe(true);
    expect(isIncompleteRow({ id: "1", title: "x" }, ["id", "title"])).toBe(false);
  });
});
