import { describe, expect, it } from "vitest";
import { findSimilarBugs, titleSimilarity } from "./similarBugs";

describe("titleSimilarity", () => {
  it("títulos iguais ou muito próximos pontuam alto", () => {
    expect(titleSimilarity("Pix não confirma o pedido", "Pagamento com Pix não confirma o pedido")).toBeGreaterThanOrEqual(0.6);
    expect(titleSimilarity("Erro 500 ao salvar endereço", "erro 500 ao salvar endereço")).toBe(1);
  });
  it("ignora acentos, caixa e palavras vazias", () => {
    expect(titleSimilarity("Botão de Finalização sumiu", "botao finalizacao SUMIU")).toBeGreaterThanOrEqual(0.9 * 1);
  });
  it("assuntos diferentes pontuam baixo", () => {
    expect(titleSimilarity("Pix não confirma o pedido", "Ícone de carrinho desalinhado no header")).toBeLessThan(0.3);
  });
  it("títulos curtos demais não geram falso positivo", () => {
    expect(titleSimilarity("Erro", "Erro")).toBe(0);
  });
});

describe("findSimilarBugs", () => {
  const bugs = [
    { id: "1", title: "Pagamento com Pix não confirma o pedido" },
    { id: "2", title: "Cupom aplicado duas vezes" },
    { id: "3", title: "Pix não confirma pedido após timeout" },
  ];
  it("ordena do mais parecido e respeita o limite", () => {
    const found = findSimilarBugs("Pix não confirma o pedido", bugs, { limit: 1 });
    expect(found.map((b) => b.id)).toEqual(["1"]);
  });
  it("sem parecidos devolve vazio", () => {
    expect(findSimilarBugs("Tela de login lenta no Safari", bugs)).toEqual([]);
  });
});
