import { describe, expect, it } from "vitest";
import { parseComment, parseInline } from "./commentMarkdown";

const STORAGE = "https://abc.supabase.co/storage/v1/object/public/evidence/room/uuid.png";

describe("parseInline", () => {
  it("negrito, itálico e código", () => {
    expect(parseInline("a **b** e *c* e `d`")).toEqual([
      { t: "text", v: "a " },
      { t: "bold", c: [{ t: "text", v: "b" }] },
      { t: "text", v: " e " },
      { t: "italic", c: [{ t: "text", v: "c" }] },
      { t: "text", v: " e " },
      { t: "code", v: "d" },
    ]);
  });

  it("não trata multiplicação como itálico", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([{ t: "text", v: "2 * 3 * 4" }]);
  });

  it("link https e URL solta, sem pontuação final", () => {
    expect(parseInline("veja https://exemplo.com/x.")).toEqual([
      { t: "text", v: "veja " },
      { t: "link", href: "https://exemplo.com/x", c: [{ t: "text", v: "https://exemplo.com/x" }] },
      { t: "text", v: "." },
    ]);
    expect(parseInline("[doc](https://exemplo.com)")).toEqual([
      { t: "link", href: "https://exemplo.com", c: [{ t: "text", v: "doc" }] },
    ]);
  });

  it("rejeita esquemas perigosos (javascript:, data:, http:)", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>", "http://inseguro.com"]) {
      const out = parseInline(`[x](${bad})`);
      expect(out.some((n) => n.t === "link")).toBe(false);
      expect(out).toEqual([{ t: "text", v: `[x](${bad})` }]);
    }
  });

  it("HTML vira texto puro (o React escapa na renderização)", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ t: "text", v: "<img src=x onerror=alert(1)>" }]);
  });

  it("imagem só do Storage; de terceiros vira link", () => {
    expect(parseInline(`![print](${STORAGE})`)).toEqual([{ t: "image", src: STORAGE, alt: "print" }]);
    const external = parseInline("![x](https://tracker.com/pixel.png)");
    expect(external).toEqual([{ t: "link", href: "https://tracker.com/pixel.png", c: [{ t: "text", v: "x" }] }]);
  });

  it("destaca @menções de usuários conhecidos (nome completo ou primeiro nome)", () => {
    const out = parseInline("oi @Maria Silva e @joao, e @ninguém", ["Maria Silva", "João Lima", "Joao"]);
    expect(out.filter((n) => n.t === "mention").map((n) => (n as { v: string }).v)).toEqual(["@Maria Silva", "@joao"]);
  });

  it("não marca prefixo de outra palavra como menção", () => {
    expect(parseInline("@Mariana", ["Maria"]).some((n) => n.t === "mention")).toBe(false);
  });
});

describe("parseComment", () => {
  it("parágrafos, lista e bloco de código", () => {
    const blocks = parseComment("Título\nlinha 2\n\n- um\n- **dois**\n\n```\nconst a = 1;\n```");
    expect(blocks.map((b) => b.t)).toEqual(["p", "ul", "code"]);
    expect((blocks[1] as { items: unknown[] }).items).toHaveLength(2);
    expect(blocks[2]).toEqual({ t: "code", v: "const a = 1;" });
  });

  it("bloco de código sem fechamento consome até o fim", () => {
    expect(parseComment("```\nabc")).toEqual([{ t: "code", v: "abc" }]);
  });

  it("não interpreta markdown dentro de bloco de código", () => {
    expect(parseComment("```\n**x**\n```")).toEqual([{ t: "code", v: "**x**" }]);
  });
});
