import { describe, expect, it } from "vitest";
import { formatOpenAge, hoursOpen, isSlaBreached } from "./cardAge";

describe("cardAge", () => {
  it("formats minutes, hours and days", () => {
    const now = Date.now();
    expect(formatOpenAge(new Date(now - 30 * 60 * 1000).toISOString())).toMatch(/m$/);
    expect(formatOpenAge(new Date(now - 5 * 60 * 60 * 1000).toISOString())).toMatch(/h$/);
    expect(formatOpenAge(new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString())).toMatch(/d$/);
  });

  it("returns 0 hours for invalid dates", () => {
    expect(hoursOpen("not-a-date")).toBe(0);
  });

  it("applies SLA thresholds by severity", () => {
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    expect(isSlaBreached({ criticism: "blocker", status: "new", createdAt: hoursAgo(5) })).toBe(true);
    expect(isSlaBreached({ criticism: "blocker", status: "new", createdAt: hoursAgo(2) })).toBe(false);
    expect(isSlaBreached({ criticism: "critical", status: "in_progress", createdAt: hoursAgo(9) })).toBe(true);
    expect(isSlaBreached({ criticism: "medium", status: "new", createdAt: hoursAgo(25) })).toBe(true);
    expect(isSlaBreached({ criticism: "blocker", status: "validated", createdAt: hoursAgo(48) })).toBe(false);
  });
});
