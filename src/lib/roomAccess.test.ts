import { describe, expect, it } from "vitest";
import { diffRoomAccess } from "./roomAccess";

describe("diffRoomAccess", () => {
  it("adds newly checked rooms and removes unchecked ones", () => {
    expect(diffRoomAccess(["a", "b"], ["b", "c"])).toEqual({
      add: ["c"],
      remove: ["a"],
    });
  });

  it("keeps the same set unchanged", () => {
    expect(diffRoomAccess(["a"], ["a"])).toEqual({ add: [], remove: [] });
  });
});
