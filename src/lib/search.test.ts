import { describe, expect, it } from "vitest";
import { matchScore, normalizeText, rankBy } from "./search";

describe("normalizeText", () => {
  it("remove acentos e caixa", () => {
    expect(normalizeText("  Sessão Crítica ")).toBe("sessao critica");
  });
});

describe("matchScore", () => {
  it("consulta vazia casa com tudo", () => {
    expect(matchScore("qualquer", "")).toBeGreaterThan(0);
  });
  it("ordena exato > prefixo > palavra > substring > sequência", () => {
    const exact = matchScore("login", "login");
    const prefix = matchScore("login rápido", "login");
    const word = matchScore("tela de login", "login");
    const sub = matchScore("relogin", "login");
    const seq = matchScore("l-o-g-i-n", "login");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(seq);
    expect(seq).toBeGreaterThan(0);
  });
  it("ignora acento na consulta", () => {
    expect(matchScore("Configurações", "configuracoes")).toBeGreaterThan(0);
  });
  it("retorna 0 quando não casa", () => {
    expect(matchScore("kanban", "xyz")).toBe(0);
  });
});

describe("rankBy", () => {
  const items = ["Sala beta", "Alpha", "Beta release", "Gama"];
  it("mantém tudo sem consulta", () => {
    expect(rankBy(items, "", (s) => s)).toEqual(items);
  });
  it("filtra e prioriza prefixo", () => {
    expect(rankBy(items, "beta", (s) => s)).toEqual(["Beta release", "Sala beta"]);
  });
});
