import { describe, expect, it } from "vitest";
import { formatRelativeTime, formatRoleLabel, shortId } from "./format";

describe("format", () => {
  it("shortens long ids", () => {
    expect(shortId("abcdefghijklmnop")).toBe("abcdefgh");
    expect(shortId("abc")).toBe("abc");
  });

  it("formats roles for the UI", () => {
    expect(formatRoleLabel("scrum_master")).toBe("Scrum");
    expect(formatRoleLabel("viewer")).toBe("Viewer");
  });

  it("formats recent timestamps in Portuguese", () => {
    const now = Date.parse("2026-08-28T18:00:00.000Z");
    expect(formatRelativeTime("2026-08-28T17:50:00.000Z", now)).toBe("há 10 min");
    expect(formatRelativeTime("2026-08-28T12:00:00.000Z", now)).toBe("há 6h");
    expect(formatRelativeTime("2026-08-26T18:00:00.000Z", now)).toBe("há 2d");
  });
});
