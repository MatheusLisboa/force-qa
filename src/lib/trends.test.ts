import { describe, expect, it } from "vitest";
import type { Bug } from "../types";
import { computeTrends, formatDuration } from "./trends";

// Quarta-feira, 14/out/2026, meio-dia (semana de segunda 12/out).
const NOW = new Date(2026, 9, 14, 12, 0, 0);
const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).toISOString();

function bug(over: Partial<Bug>): Bug {
  return {
    id: Math.random().toString(36).slice(2),
    warRoomId: "r",
    title: "t",
    description: "",
    criticism: "medium",
    status: "new",
    ownerId: null,
    ownerName: null,
    environment: "dev",
    tags: [],
    priority: "medium",
    type: "bug",
    createdAt: at(13),
    updatedAt: at(13),
    createdBy: "u",
    createdByName: "u",
    ...over,
  } as Bug;
}

describe("computeTrends", () => {
  it("gera N semanas terminando na semana atual (segunda a segunda)", () => {
    const { weeks } = computeTrends([], { weeks: 4, now: NOW });
    expect(weeks).toHaveLength(4);
    expect(weeks[3].label).toBe("12/10");
    expect(weeks[2].label).toBe("05/10");
    expect(weeks[0].label).toBe("21/09");
  });

  it("conta criados, resolvidos e backlog por semana", () => {
    const bugs = [
      bug({ createdAt: at(6) }), // semana de 05/10, ainda aberto
      bug({ createdAt: at(7), status: "validated", resolvedAt: at(13) }), // criado 05/10, resolvido 12/10
      bug({ createdAt: at(13) }), // semana atual
    ];
    const { weeks } = computeTrends(bugs, { weeks: 2, now: NOW });
    expect(weeks[0]).toMatchObject({ label: "05/10", created: 2, resolved: 0, backlog: 2 });
    expect(weeks[1]).toMatchObject({ label: "12/10", created: 1, resolved: 1, backlog: 2 });
  });

  it("backlog ignora cards criados depois da semana", () => {
    const { weeks } = computeTrends([bug({ createdAt: at(13) })], { weeks: 2, now: NOW });
    expect(weeks[0].backlog).toBe(0);
    expect(weeks[1].backlog).toBe(1);
  });

  it("resumo: abertos, validados, mediana, reabertura, SLA e sem responsável", () => {
    const bugs = [
      bug({ createdAt: at(1, 8), status: "validated", resolvedAt: at(1, 10) }), // 2h
      bug({ createdAt: at(1, 8), status: "validated", resolvedAt: at(1, 18) }), // 10h
      bug({ createdAt: at(1, 8), status: "validated", resolvedAt: at(2, 8) }), // 24h
      bug({ criticism: "blocker", createdAt: at(10), ownerId: "x" }), // SLA estourado, atribuído
      bug({ criticism: "low", createdAt: at(14, 11), reopenCount: 1 }), // reaberto, recente
    ];
    const { summary } = computeTrends(bugs, { now: NOW });
    expect(summary.total).toBe(5);
    expect(summary.validated).toBe(3);
    expect(summary.openNow).toBe(2);
    expect(summary.medianResolutionHours).toBe(10);
    expect(summary.reopenRate).toBeCloseTo(0.2);
    expect(summary.openBySeverity).toMatchObject({ blocker: 1, low: 1 });
    expect(summary.unassignedOpen).toBe(1);
  });

  it("sem dados não quebra", () => {
    const { summary, weeks } = computeTrends([], { now: NOW });
    expect(summary).toMatchObject({ total: 0, openNow: 0, medianResolutionHours: null, reopenRate: 0 });
    expect(weeks.every((w) => w.created === 0 && w.resolved === 0 && w.backlog === 0)).toBe(true);
  });

  it("ignora datas inválidas", () => {
    const { weeks } = computeTrends([bug({ createdAt: "lixo" })], { weeks: 1, now: NOW });
    expect(weeks[0].created).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formata minutos, horas e dias", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(0.2)).toBe("12 min");
    expect(formatDuration(5)).toBe("5 h");
    expect(formatDuration(72)).toBe("3 d");
  });
});
