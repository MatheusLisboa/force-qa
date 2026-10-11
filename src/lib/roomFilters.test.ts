import { describe, expect, it } from "vitest";
import { applyRoomFilters, DEFAULT_ROOM_FILTERS, hasActiveRoomFilters, parseRoomFilters } from "./roomFilters";

describe("parseRoomFilters", () => {
  it("sem parâmetros devolve os padrões", () => {
    expect(parseRoomFilters("")).toEqual(DEFAULT_ROOM_FILTERS);
    expect(parseRoomFilters("?room=abc")).toEqual(DEFAULT_ROOM_FILTERS);
  });
  it("lê filtros válidos", () => {
    expect(parseRoomFilters("?room=r&q=pix&env=production&type=security&sev=blocker&owner=unassigned")).toEqual({
      q: "pix",
      env: "production",
      type: "security",
      severity: "blocker",
      owner: "unassigned",
    });
  });
  it("ignora valores inválidos ou maliciosos", () => {
    const parsed = parseRoomFilters("?env=<script>&type=xxx&sev=alto&owner=../../etc&q=" + "a".repeat(500));
    expect(parsed.env).toBe("all");
    expect(parsed.type).toBe("all");
    expect(parsed.severity).toBe("all");
    expect(parsed.owner).toBe("all");
    expect(parsed.q).toHaveLength(100);
  });
});

describe("applyRoomFilters", () => {
  it("preserva room/card/pulse e acrescenta só o que não é padrão", () => {
    const next = applyRoomFilters("?room=r1&card=c1&pulse=blockers", { ...DEFAULT_ROOM_FILTERS, severity: "high", q: "pix pago" });
    const params = new URLSearchParams(next);
    expect(params.get("room")).toBe("r1");
    expect(params.get("card")).toBe("c1");
    expect(params.get("pulse")).toBe("blockers");
    expect(params.get("sev")).toBe("high");
    expect(params.get("q")).toBe("pix pago");
    expect(params.has("env")).toBe(false);
  });
  it("remove os parâmetros quando volta ao padrão", () => {
    expect(applyRoomFilters("?room=r1&sev=high&q=x", DEFAULT_ROOM_FILTERS)).toBe("?room=r1");
    expect(applyRoomFilters("?sev=high", DEFAULT_ROOM_FILTERS)).toBe("");
  });
  it("ida e volta mantém os filtros", () => {
    const filters = { q: "ação & cia", env: "dev", type: "bug", severity: "low", owner: "abc-123" };
    expect(parseRoomFilters(applyRoomFilters("?room=r", filters))).toEqual(filters);
  });
});

describe("hasActiveRoomFilters", () => {
  it("detecta algum filtro ativo", () => {
    expect(hasActiveRoomFilters(DEFAULT_ROOM_FILTERS)).toBe(false);
    expect(hasActiveRoomFilters({ ...DEFAULT_ROOM_FILTERS, q: "x" })).toBe(true);
  });
});
