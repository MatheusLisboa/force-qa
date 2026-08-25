import { describe, expect, it } from "vitest";
import { formatRoleLabel, shortId } from "./format";

describe("format", () => {
  it("shortens long ids", () => {
    expect(shortId("abcdefghijklmnop")).toBe("abcdefgh");
    expect(shortId("abc")).toBe("abc");
  });

  it("formats roles for the UI", () => {
    expect(formatRoleLabel("scrum_master")).toBe("Scrum");
    expect(formatRoleLabel("viewer")).toBe("Viewer");
  });
});
