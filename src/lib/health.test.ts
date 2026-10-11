import { describe, expect, it, vi } from "vitest";
import { checkBackendHealth } from "./health";

const base = { url: "https://abc.supabase.co", anonKey: "key" };
const res = (status: number) => ({ status }) as Response;

describe("checkBackendHealth", () => {
  it("ok quando há resposta HTTP, mesmo 401", async () => {
    expect(await checkBackendHealth({ ...base, fetchImpl: vi.fn().mockResolvedValue(res(200)) })).toEqual({ status: "ok" });
    expect(await checkBackendHealth({ ...base, fetchImpl: vi.fn().mockResolvedValue(res(401)) })).toEqual({ status: "ok" });
  });

  it("unreachable em 5xx e em falha de rede", async () => {
    expect(await checkBackendHealth({ ...base, fetchImpl: vi.fn().mockResolvedValue(res(503)) })).toEqual({ status: "unreachable" });
    expect(await checkBackendHealth({ ...base, fetchImpl: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) })).toEqual({
      status: "unreachable",
    });
  });

  it("timeout quando a requisição não responde", async () => {
    const hang = vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))
    );
    expect(await checkBackendHealth({ ...base, timeoutMs: 20, fetchImpl: hang as unknown as typeof fetch })).toEqual({ status: "timeout" });
  });

  it("misconfigured sem URL ou chave", async () => {
    const fetchImpl = vi.fn();
    const result = await checkBackendHealth({ url: "", anonKey: "", fetchImpl });
    expect(result.status).toBe("misconfigured");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect((await checkBackendHealth({ url: "https://placeholder.supabase.co", anonKey: "x", fetchImpl })).status).toBe("misconfigured");
  });

  it("chama o endpoint /auth/v1/health com a apikey", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200));
    await checkBackendHealth({ url: "https://abc.supabase.co/", anonKey: "key", fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://abc.supabase.co/auth/v1/health");
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({ apikey: "key" });
  });
});
