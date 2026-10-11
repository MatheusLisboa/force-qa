import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, createMemoryLimiter, enforceRateLimit } from "./rateLimit";

vi.mock("./logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const rule = { windowMs: 1000, max: 2, message: "limite" };

describe("createMemoryLimiter", () => {
  it("bloqueia depois do máximo e libera quando a janela passa", () => {
    let t = 0;
    const limiter = createMemoryLimiter(() => t);
    expect(limiter.hit("k", rule)).toBe(true);
    expect(limiter.hit("k", rule)).toBe(true);
    expect(limiter.hit("k", rule)).toBe(false);
    t = 1001;
    expect(limiter.hit("k", rule)).toBe(true);
  });

  it("separa chaves", () => {
    const limiter = createMemoryLimiter(() => 0);
    limiter.hit("a", rule);
    limiter.hit("a", rule);
    expect(limiter.hit("a", rule)).toBe(false);
    expect(limiter.hit("b", rule)).toBe(true);
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("usa o contador do banco quando disponível", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    await expect(enforceRateLimit({ rpc } as never, "ai", "u1", rule)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", { p_key: "ai:u1", p_window_seconds: 1, p_max: 2 });
  });

  it("lança 429 quando o banco nega", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    await expect(enforceRateLimit({ rpc } as never, "ai", "u2", rule)).rejects.toMatchObject({
      status: 429,
      message: "limite",
    });
  });

  it("cai para memória se a função SQL não existe", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "function not found" } });
    const admin = { rpc } as never;
    await enforceRateLimit(admin, "fallback", "u3", rule);
    await enforceRateLimit(admin, "fallback", "u3", rule);
    await expect(enforceRateLimit(admin, "fallback", "u3", rule)).rejects.toMatchObject({ status: 429 });
  });

  it("cai para memória se o rpc lança", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("rede"));
    const admin = { rpc } as never;
    await enforceRateLimit(admin, "throws", "u4", { ...rule, max: 1 });
    await expect(enforceRateLimit(admin, "throws", "u4", { ...rule, max: 1 })).rejects.toMatchObject({ status: 429 });
  });

  it("funciona sem cliente (só memória)", async () => {
    await enforceRateLimit(null, "none", "u5", { ...rule, max: 1 });
    await expect(enforceRateLimit(null, "none", "u5", { ...rule, max: 1 })).rejects.toMatchObject({ status: 429 });
  });
});

describe("clientIp", () => {
  it("usa o primeiro IP do x-forwarded-for", () => {
    expect(clientIp({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })).toBe("1.2.3.4");
  });
  it("aceita array e x-real-ip", () => {
    expect(clientIp({ "x-forwarded-for": ["5.6.7.8"] })).toBe("5.6.7.8");
    expect(clientIp({ "x-real-ip": "9.9.9.9" })).toBe("9.9.9.9");
  });
  it("devolve unknown sem cabeçalhos", () => {
    expect(clientIp({})).toBe("unknown");
  });
});
