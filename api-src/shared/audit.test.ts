import { describe, expect, it, vi } from "vitest";

vi.mock("./auth", () => ({ getSupabaseAdmin: () => ({ rpc: vi.fn() }) }));
vi.mock("./logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { logAudit } from "./audit";
import { logger } from "./logger";

describe("logAudit", () => {
  it("chama a função do banco com os parâmetros certos", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await logAudit({ organizationId: "org", actorId: "u1", actorName: "Ana", action: "user.created", targetType: "user", targetId: "u2", detail: { role: "qa" } }, { rpc });
    expect(rpc).toHaveBeenCalledWith("log_audit_event", {
      p_org: "org",
      p_actor: "u1",
      p_actor_name: "Ana",
      p_action: "user.created",
      p_target_type: "user",
      p_target_id: "u2",
      p_detail: { role: "qa" },
    });
  });

  it("campos opcionais viram null/objeto vazio", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await logAudit({ organizationId: null, action: "x" }, { rpc });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_org: null, p_actor: null, p_target_type: null, p_detail: {} });
  });

  it("erro do banco não lança (auditoria nunca derruba a operação)", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "função não existe" } });
    await expect(logAudit({ organizationId: "o", action: "x" }, { rpc })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("exceção de rede também não lança", async () => {
    const rpc = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(logAudit({ organizationId: "o", action: "x" }, { rpc })).resolves.toBeUndefined();
  });
});
