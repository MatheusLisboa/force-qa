import { describe, expect, it } from "vitest";
import { parseReproChecklist, reproForType } from "./reproChecklist";

describe("reproChecklist", () => {
  it("seeds a bug checklist and ignores junk", () => {
    expect(reproForType("bug")).toHaveLength(3);
    expect(reproForType("improvement")).toEqual([]);
    expect(parseReproChecklist([{ id: "a", text: "Repro", done: true }, { text: "" }, null])).toEqual([
      { id: "a", text: "Repro", done: true },
    ]);
  });
});
