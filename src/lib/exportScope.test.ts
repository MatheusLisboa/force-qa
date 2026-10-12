import { describe, expect, it } from "vitest";
import { describeExportScope, isRoomInExportScope, normalizeExportScope } from "./exportScope";

describe("normalizeExportScope", () => {
  it("ausente ou inválido = toda a organização", () => {
    expect(normalizeExportScope(undefined)).toBeNull();
    expect(normalizeExportScope(null)).toBeNull();
    expect(normalizeExportScope("a,b")).toBeNull();
  });
  it("limpa, remove vazios e duplicados", () => {
    expect(normalizeExportScope([" a ", "b", "a", "", null])).toEqual(["a", "b"]);
  });
  it("lista vazia continua vazia (nenhuma sala)", () => {
    expect(normalizeExportScope([])).toEqual([]);
  });
});

describe("isRoomInExportScope", () => {
  it("null libera tudo; lista só o que está nela; vazia bloqueia tudo", () => {
    expect(isRoomInExportScope("x", null)).toBe(true);
    expect(isRoomInExportScope("x", ["x", "y"])).toBe(true);
    expect(isRoomInExportScope("z", ["x", "y"])).toBe(false);
    expect(isRoomInExportScope("x", [])).toBe(false);
  });
});

describe("describeExportScope", () => {
  it("descreve para a interface", () => {
    expect(describeExportScope(null)).toBe("Todas as salas da organização");
    expect(describeExportScope([])).toBe("Nenhuma sala");
    expect(describeExportScope(["a", "b"], { a: "Sala A" })).toBe("Sala A, b");
    expect(describeExportScope(["a", "b", "c", "d", "e"])).toBe("a, b, c e mais 2");
  });
});
