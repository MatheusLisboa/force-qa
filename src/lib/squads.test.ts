import { describe, expect, it } from "vitest";
import { isKnownSquad, normalizeArea } from "./squads";

describe("normalizeArea", () => {
  it("keeps current presets", () => {
    expect(normalizeArea("QA")).toBe("QA");
    expect(normalizeArea(" produto ")).toBe("Produto");
  });

  it("maps legacy squad names", () => {
    expect(normalizeArea("Squad Pix")).toBe("Produto");
    expect(normalizeArea("Pix")).toBe("Produto");
    expect(normalizeArea("Squad Checkout")).toBe("Produto");
    expect(normalizeArea("Squad Core")).toBe("Dev");
    expect(normalizeArea("Core")).toBe("Dev");
  });

  it("leaves custom areas untouched", () => {
    expect(normalizeArea("Plataforma")).toBe("Plataforma");
    expect(isKnownSquad("Plataforma")).toBe(false);
  });
});
