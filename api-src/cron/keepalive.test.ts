import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/auth", () => ({ envVar: () => undefined, getSupabaseAdmin: () => ({}) }));
vi.mock("../shared/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { runKeepalive } from "./keepalive";

describe("runKeepalive", () => {
  it("ok quando a consulta responde, sem alerta", async () => {
    const notify = vi.fn();
    expect(await runKeepalive(async () => ({ error: null }), notify)).toEqual({ ok: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it("avisa quando o banco devolve erro", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const result = await runKeepalive(async () => ({ error: { message: "connection refused" } }), notify);
    expect(result).toEqual({ ok: false, detail: "connection refused" });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("connection refused"));
  });

  it("avisa quando a consulta lança (projeto pausado)", async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    const result = await runKeepalive(async () => {
      throw new TypeError("fetch failed");
    }, notify);
    expect(result.ok).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("falha no alerta não derruba a resposta", async () => {
    const notify = vi.fn().mockRejectedValue(new Error("webhook fora"));
    await expect(runKeepalive(async () => ({ error: { message: "x" } }), notify)).resolves.toMatchObject({ ok: false });
  });
});
