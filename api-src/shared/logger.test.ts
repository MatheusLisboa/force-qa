import { describe, expect, it } from "vitest";
import { formatLog, redact } from "./logger";

describe("redact", () => {
  it("mascara chaves sensíveis em objetos aninhados", () => {
    const out = redact({ user: "ana", headers: { authorization: "Bearer abc", "x-api-key": "k" }, nested: [{ password: "p" }] });
    expect(out).toEqual({
      user: "ana",
      headers: { authorization: "[redacted]", "x-api-key": "[redacted]" },
      nested: [{ password: "[redacted]" }],
    });
  });

  it("mascara bearer tokens dentro de strings", () => {
    expect(redact("falhou com Bearer eyJhbGciOi.abc.def agora")).toBe("falhou com Bearer [redacted] agora");
  });

  it("reduz Error a name/message/status (sem stack)", () => {
    const err = Object.assign(new Error("boom"), { status: 403 });
    expect(redact(err)).toEqual({ name: "Error", message: "boom", status: 403 });
  });
});

describe("formatLog", () => {
  it("usa a primeira string como mensagem e o resto como detalhes", () => {
    expect(formatLog("error", ["rooms/join:", new Error("x")])).toMatchObject({
      level: "error",
      message: "rooms/join:",
      details: [{ message: "x" }],
    });
  });
  it("aceita Error como primeiro argumento", () => {
    expect(formatLog("warn", [new Error("só erro")]).message).toBe("só erro");
  });
});
