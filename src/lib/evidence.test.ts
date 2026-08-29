import { describe, expect, it } from "vitest";
import { isHttpEvidence, isImageEvidence, safeMediaUrl, storagePathFromUrl } from "./evidence";

describe("safeMediaUrl", () => {
  it("keeps https links and rejects javascript/data/http", () => {
    expect(safeMediaUrl("https://example.com/shot.png")).toBe("https://example.com/shot.png");
    expect(safeMediaUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeMediaUrl("data:image/png;base64,abc")).toBeUndefined();
    expect(safeMediaUrl("http://insecure.example/a.png")).toBeUndefined();
    expect(safeMediaUrl("")).toBeUndefined();
  });

  it("does not treat javascript as an image or http evidence", () => {
    expect(isImageEvidence("javascript:alert(1)")).toBe(false);
    expect(isHttpEvidence("javascript:alert(1)")).toBe(false);
  });

  it("extracts storage object paths", () => {
    const url =
      "https://proj.supabase.co/storage/v1/object/public/evidence/room-1/abc.png";
    expect(storagePathFromUrl(url)).toBe("room-1/abc.png");
  });
});
