import { describe, expect, it } from "vitest";
import { auditCategory, describeAuditEvent, filterAuditEvents, type AuditEventRow } from "./auditDescribe";

const event = (action: string, detail: Record<string, unknown> = {}, actorName: string | null = "Marina"): AuditEventRow => ({
  id: Math.random(),
  organizationId: "o",
  actorId: "a",
  actorName,
  action,
  targetType: null,
  targetId: null,
  detail,
  createdAt: "2026-10-12T10:00:00Z",
});

describe("describeAuditEvent", () => {
  it("troca de papel", () => {
    expect(describeAuditEvent(event("user.role_changed", { name: "Rafael", from: "developer", to: "qa" }))).toBe(
      "Marina mudou o papel de Rafael: Dev → QA."
    );
  });

  it("visibilidade e permissão do convidado usam os rótulos da interface", () => {
    expect(describeAuditEvent(event("room.visibility_changed", { name: "Sprint 42", from: "organization", to: "members" }))).toBe(
      "Marina mudou a visibilidade da sala Sprint 42: Visível a toda a organização → Somente membros."
    );
    expect(describeAuditEvent(event("room.guest_permission_changed", { name: "S", from: "read", to: "write" }))).toContain(
      "Ler e comentar → Criar e editar cards"
    );
  });

  it("o nível \"link\" aparece com o rótulo próprio", () => {
    expect(describeAuditEvent(event("room.visibility_changed", { name: "S", from: "link", to: "organization" }))).toContain(
      "Só por link ou ID → Visível a toda a organização"
    );
  });

  it("somente leitura, token e permissões", () => {
    expect(describeAuditEvent(event("room.member_read_only", { name: "Ana", read_only: true }))).toBe("Marina deixou Ana somente leitura numa sala.");
    expect(describeAuditEvent(event("room.member_read_only", { name: "Ana", read_only: false }))).toBe("Marina liberou Ana para editar numa sala.");
    expect(describeAuditEvent(event("integration.export_token_rotated", { rooms: "all" }))).toContain("todas as salas");
    expect(describeAuditEvent(event("integration.export_token_rotated", { rooms: 3 }))).toContain("3 sala(s)");
    expect(describeAuditEvent(event("permissions.changed", { role: "qa", capability: "invite_members", allowed: false }))).toBe(
      'Marina retirou "Convidar" para o papel QA.'
    );
  });

  it("sem ator vira 'O sistema'; ação desconhecida não quebra", () => {
    expect(describeAuditEvent(event("user.deleted", { name: "Ana" }, null))).toBe("O sistema removeu a conta de Ana.");
    expect(describeAuditEvent(event("algo.novo"))).toBe("Marina: algo.novo");
  });

  it("não vaza segredo: o texto do convite renovado não menciona token", () => {
    const text = describeAuditEvent(event("room.guest_invite_changed", { rotated: true, token: "gst_SEGREDO" }));
    expect(text).not.toContain("gst_SEGREDO");
  });
});

describe("categorias e filtro", () => {
  it("classifica por prefixo", () => {
    expect(auditCategory("user.created")).toBe("users");
    expect(auditCategory("room.member_added")).toBe("rooms");
    expect(auditCategory("integration.webhook_changed")).toBe("integrations");
    expect(auditCategory("permissions.changed")).toBe("permissions");
  });

  it("filtra por categoria e por texto", () => {
    const events = [
      event("user.role_changed", { name: "Rafael", from: "qa", to: "admin" }),
      event("room.created", { name: "Sala X", visibility: "organization" }, "Bruno"),
    ];
    expect(filterAuditEvents(events, { category: "users", query: "" })).toHaveLength(1);
    expect(filterAuditEvents(events, { category: "all", query: "bruno" })).toHaveLength(1);
    expect(filterAuditEvents(events, { category: "all", query: "inexistente" })).toHaveLength(0);
    expect(filterAuditEvents(events, { category: "all", query: "" })).toHaveLength(2);
  });
});
