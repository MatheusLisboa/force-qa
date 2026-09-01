import { describe, expect, it } from "vitest";
import { apiPathTail, wantsExportToken } from "./vercelApiPath";

describe("vercelApiPath", () => {
  it("reads catch-all path from query or URL", () => {
    expect(apiPathTail({ query: { path: ["suggest-bug-fields"] } }, "ai")).toBe(
      "suggest-bug-fields"
    );
    expect(apiPathTail({ query: { path: "rooms" } }, "export")).toBe("rooms");
    expect(apiPathTail({ url: "/api/export/cards?roomId=1" }, "export")).toBe("cards");
  });

  it("detects the export-token tab after the webhook rewrite", () => {
    expect(wantsExportToken({ query: { tab: "export-token" } })).toBe(true);
    expect(wantsExportToken({ url: "/api/admin/org-export-token" })).toBe(true);
    expect(wantsExportToken({ url: "/api/admin/org-webhook" })).toBe(false);
  });
});
