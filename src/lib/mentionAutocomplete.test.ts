import { describe, expect, it } from "vitest";
import { applyMention, filterMentionCandidates, getMentionQuery } from "./mentionAutocomplete";

describe("getMentionQuery", () => {
  it("detecta menção em andamento", () => {
    expect(getMentionQuery("oi @mar", 7)).toEqual({ start: 3, query: "mar" });
    expect(getMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(getMentionQuery("@Maria S", 8)).toEqual({ start: 0, query: "Maria S" });
  });
  it("ignora e-mails e @ fora do cursor", () => {
    expect(getMentionQuery("ana@acme.dev", 12)).toBeNull();
    expect(getMentionQuery("sem arroba", 5)).toBeNull();
  });
  it("encerra com quebra de linha ou dois espaços", () => {
    expect(getMentionQuery("@mar\nfoo", 8)).toBeNull();
    expect(getMentionQuery("@mar  x", 7)).toBeNull();
  });
});

describe("filterMentionCandidates", () => {
  const users = [{ name: "Maria Silva" }, { name: "João Mariano" }, { name: "Ana Souza" }];
  it("prioriza prefixo do nome, depois de palavra, depois substring", () => {
    expect(filterMentionCandidates(users, "mar").map((u) => u.name)).toEqual(["Maria Silva", "João Mariano"]);
  });
  it("ignora acentos e caixa", () => {
    expect(filterMentionCandidates(users, "JOAO").map((u) => u.name)).toEqual(["João Mariano"]);
  });
  it("sem consulta lista em ordem alfabética, respeitando o limite", () => {
    expect(filterMentionCandidates(users, "", 2).map((u) => u.name)).toEqual(["Ana Souza", "João Mariano"]);
  });
});

describe("applyMention", () => {
  it("substitui o trecho e posiciona o cursor", () => {
    const query = getMentionQuery("oi @mar", 7)!;
    expect(applyMention("oi @mar", query, 7, "Maria Silva")).toEqual({ text: "oi @Maria Silva ", cursor: 16 });
  });
  it("preserva o texto depois do cursor", () => {
    const query = getMentionQuery("@ma fim", 3)!;
    expect(applyMention("@ma fim", query, 3, "Maria").text).toBe("@Maria  fim");
  });
});
