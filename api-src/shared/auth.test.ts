import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as { id: string } | null,
  getUserError: null as unknown,
  profile: null as Record<string, unknown> | null,
  rolePermissions: [] as Array<{ role: string; capability: string; allowed: boolean }>,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: state.getUserError }),
    },
    rpc: async () => ({ data: true, error: null }),
    from: (table: string) => {
      if (table === "users") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.profile, error: null }) }) }) };
      }
      return { select: async () => ({ data: state.rolePermissions, error: null }) };
    },
  }),
}));

import {
  clientErrorMessage,
  httpErrorStatus,
  readJsonBody,
  requireAdmin,
  requireCapability,
  requireSuperadmin,
  requireUser,
} from "./auth";

beforeEach(() => {
  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
  state.user = { id: "u1" };
  state.getUserError = null;
  state.profile = { role: "qa", is_guest: false, organization_id: "org-1", is_superadmin: false };
  state.rolePermissions = [];
});

describe("requireUser", () => {
  it("401 sem cabeçalho Authorization", async () => {
    await expect(requireUser(undefined)).rejects.toMatchObject({ status: 401 });
    await expect(requireUser("Basic abc")).rejects.toMatchObject({ status: 401 });
  });

  it("401 com token inválido", async () => {
    state.user = null;
    state.getUserError = new Error("jwt expired");
    await expect(requireUser("Bearer x")).rejects.toMatchObject({ status: 401 });
  });

  it("devolve o perfil do usuário", async () => {
    const authed = await requireUser("Bearer ok");
    expect(authed).toMatchObject({ role: "qa", isGuest: false, organizationId: "org-1", isSuperadmin: false });
  });

  it("assume viewer quando não há perfil", async () => {
    state.profile = null;
    expect((await requireUser("Bearer ok")).role).toBe("viewer");
  });

  it("guest não herda organização padrão", async () => {
    state.profile = { role: "qa", is_guest: true, organization_id: null, is_superadmin: false };
    expect((await requireUser("Bearer ok")).organizationId).toBe("");
  });
});

describe("autorização por capacidade", () => {
  it("viewer não pode gerenciar usuários (403)", async () => {
    state.profile = { role: "viewer", is_guest: false, organization_id: "org-1", is_superadmin: false };
    await expect(requireAdmin("Bearer ok")).rejects.toMatchObject({ status: 403 });
  });

  it("guest nunca passa em operações administrativas", async () => {
    state.profile = { role: "admin", is_guest: true, organization_id: "org-1", is_superadmin: false };
    await expect(requireAdmin("Bearer ok")).rejects.toMatchObject({ status: 403 });
  });

  it("admin gerencia usuários", async () => {
    state.profile = { role: "admin", is_guest: false, organization_id: "org-1", is_superadmin: false };
    await expect(requireAdmin("Bearer ok")).resolves.toMatchObject({ role: "admin" });
  });

  it("respeita a matriz editável do banco", async () => {
    state.profile = { role: "qa", is_guest: false, organization_id: "org-1", is_superadmin: false };
    state.rolePermissions = [{ role: "qa", capability: "manage_integrations", allowed: true }];
    await expect(requireCapability("Bearer ok", "manage_integrations")).resolves.toBeDefined();
  });

  it("requireSuperadmin recusa admin comum", async () => {
    state.profile = { role: "admin", is_guest: false, organization_id: "org-1", is_superadmin: false };
    await expect(requireSuperadmin("Bearer ok")).rejects.toMatchObject({ status: 403 });
    state.profile = { role: "admin", is_guest: false, organization_id: "org-1", is_superadmin: true };
    await expect(requireSuperadmin("Bearer ok")).resolves.toMatchObject({ isSuperadmin: true });
  });
});

describe("helpers de erro", () => {
  it("httpErrorStatus mapeia códigos do Postgres", () => {
    expect(httpErrorStatus({ code: "42501" })).toBe(403);
    expect(httpErrorStatus({ code: "23505" })).toBe(409);
    expect(httpErrorStatus({ code: "23503" })).toBe(400);
    expect(httpErrorStatus({ status: 429 })).toBe(429);
    expect(httpErrorStatus(new Error("x"))).toBe(500);
  });

  it("clientErrorMessage extrai a melhor mensagem", () => {
    expect(clientErrorMessage(undefined, "fallback")).toBe("fallback");
    expect(clientErrorMessage("texto", "fallback")).toBe("texto");
    expect(clientErrorMessage(new Error("msg"), "fallback")).toBe("msg");
    expect(clientErrorMessage({ details: "detalhe" }, "fallback")).toBe("detalhe");
  });

  it("readJsonBody tolera lixo", () => {
    expect(readJsonBody('{"a":1}')).toEqual({ a: 1 });
    expect(readJsonBody("não é json")).toEqual({});
    expect(readJsonBody(null)).toEqual({});
    expect(readJsonBody({ b: 2 })).toEqual({ b: 2 });
  });
});
