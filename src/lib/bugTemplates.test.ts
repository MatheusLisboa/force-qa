import { describe, expect, it } from "vitest";
import { descriptionTemplate, isUntouchedTemplate } from "./bugTemplates";

describe("bugTemplates", () => {
  it("todo tipo tem um modelo não vazio", () => {
    for (const type of ["bug", "requirement", "ihc", "product", "improvement", "ui_adjustment", "performance", "security"] as const) {
      expect(descriptionTemplate(type).length).toBeGreaterThan(10);
    }
  });
  it("modelos são todos diferentes entre si", () => {
    const types = ["bug", "requirement", "ihc", "product", "improvement", "ui_adjustment", "performance", "security"] as const;
    expect(new Set(types.map(descriptionTemplate)).size).toBe(types.length);
  });
  it("detecta descrição vazia ou modelo intocado", () => {
    expect(isUntouchedTemplate("")).toBe(true);
    expect(isUntouchedTemplate("   \n")).toBe(true);
    expect(isUntouchedTemplate(descriptionTemplate("bug"))).toBe(true);
    expect(isUntouchedTemplate(descriptionTemplate("security"))).toBe(true);
  });
  it("não sobrescreve o que a pessoa escreveu", () => {
    expect(isUntouchedTemplate(descriptionTemplate("bug") + "\nPasso 1: abrir o app")).toBe(false);
    expect(isUntouchedTemplate("Texto livre")).toBe(false);
  });
});
