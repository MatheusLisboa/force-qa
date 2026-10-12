import { formatRoleLabel } from "./format";
import { PERMISSION_CAPABILITY_META, type PermissionCapability } from "./permissions";
import { ROOM_VISIBILITY_LABEL, GUEST_PERMISSION_LABEL, type GuestPermission, type RoomVisibility } from "./roomAccess";

export interface AuditEventRow {
  id: number | string;
  organizationId: string | null;
  actorId: string | null;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export type AuditCategory = "users" | "rooms" | "integrations" | "permissions";

export const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  users: "Pessoas",
  rooms: "Salas e acesso",
  integrations: "Integrações",
  permissions: "Permissões",
};

export function auditCategory(action: string): AuditCategory {
  if (action.startsWith("user.")) return "users";
  if (action.startsWith("integration.")) return "integrations";
  if (action.startsWith("permissions.")) return "permissions";
  return "rooms";
}

const text = (value: unknown, fallback = "alguém") => (typeof value === "string" && value.trim() ? value.trim() : fallback);

function visibilityLabel(value: unknown): string {
  const key = value as RoomVisibility;
  return ROOM_VISIBILITY_LABEL[key]?.label ?? text(value, "?");
}

function guestPermissionLabel(value: unknown): string {
  const key = value as GuestPermission;
  return GUEST_PERMISSION_LABEL[key]?.label ?? text(value, "?");
}

/** Frase curta em português para a trilha de auditoria. Nunca depende de campos secretos. */
export function describeAuditEvent(event: Pick<AuditEventRow, "action" | "actorName" | "detail">): string {
  const who = event.actorName?.trim() || "O sistema";
  const d = event.detail ?? {};
  const target = text(d.name);

  switch (event.action) {
    case "user.created":
      return `${who} criou a conta de ${target} (${formatRoleLabel(text(d.role, ""))}).`;
    case "user.deleted":
      return `${who} removeu a conta de ${target}.`;
    case "user.role_changed":
      return `${who} mudou o papel de ${target}: ${formatRoleLabel(text(d.from, "?"))} → ${formatRoleLabel(text(d.to, "?"))}.`;
    case "user.org_changed":
      return `${who} moveu ${target} para outra organização.`;
    case "user.superadmin_changed":
      return d.to ? `${who} tornou ${target} superadmin.` : `${who} tirou o superadmin de ${target}.`;
    case "room.created":
      return `${who} criou a sala ${text(d.name, "sem nome")} (${visibilityLabel(d.visibility).toLowerCase()}).`;
    case "room.deleted":
      return `${who} excluiu a sala ${text(d.name, "sem nome")}.`;
    case "room.member_added":
      return `${who} adicionou ${target} a uma sala.`;
    case "room.member_removed":
      return `${who} removeu ${target} de uma sala.`;
    case "room.member_joined":
      return `${who} entrou numa sala pelo link ou ID.`;
    case "room.member_invited":
      return `${who} convidou ${text(d.email, "alguém")} para uma sala.`;
    case "room.member_read_only":
      return d.read_only
        ? `${who} deixou ${target} somente leitura numa sala.`
        : `${who} liberou ${target} para editar numa sala.`;
    case "room.guest_joined":
      return `${who} entrou como convidado numa sala.`;
    case "room.visibility_changed":
      return `${who} mudou a visibilidade da sala ${target}: ${visibilityLabel(d.from)} → ${visibilityLabel(d.to)}.`;
    case "room.guest_permission_changed":
      return `${who} mudou o que convidados fazem na sala ${target}: ${guestPermissionLabel(d.from)} → ${guestPermissionLabel(d.to)}.`;
    case "room.guest_access_changed":
      return d.guest_access_disabled
        ? `${who} bloqueou convidados na sala ${target}.`
        : `${who} liberou convidados na sala ${target}.`;
    case "room.guest_invite_changed":
      return d.rotated ? `${who} gerou um link de convidado novo (o anterior deixou de valer).` : `${who} alterou a validade do link de convidado.`;
    case "integration.webhook_changed":
      return d.configured ? `${who} configurou o webhook da organização.` : `${who} desativou o webhook da organização.`;
    case "integration.export_token_rotated":
      return `${who} gerou um token de extração (${d.rooms === "all" ? "todas as salas" : `${d.rooms} sala(s)`}).`;
    case "integration.export_token_revoked":
      return `${who} revogou o token de extração.`;
    case "integration.export_scope_changed":
      return `${who} mudou as salas do token de extração (${d.rooms === "all" ? "todas" : `${d.rooms} sala(s)`}).`;
    case "permissions.changed": {
      const capability = PERMISSION_CAPABILITY_META[d.capability as PermissionCapability]?.label ?? text(d.capability, "uma permissão");
      return `${who} ${d.allowed ? "liberou" : "retirou"} "${capability}" para o papel ${formatRoleLabel(text(d.role, ""))}.`;
    }
    default:
      return `${who}: ${event.action}`;
  }
}

export function filterAuditEvents(
  events: AuditEventRow[],
  filters: { category: AuditCategory | "all"; query: string }
): AuditEventRow[] {
  const q = filters.query.trim().toLowerCase();
  return events.filter((event) => {
    if (filters.category !== "all" && auditCategory(event.action) !== filters.category) return false;
    if (!q) return true;
    return describeAuditEvent(event).toLowerCase().includes(q) || (event.actorName ?? "").toLowerCase().includes(q);
  });
}
