import { getSupabaseAdmin } from "./auth";
import { logger } from "./logger";

export interface AuditEvent {
  /** Organização dona do evento (nula = evento da plataforma, só o superadmin vê). */
  organizationId: string | null;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  /** Nunca inclua segredos (tokens, senhas, URLs de webhook). */
  detail?: Record<string, unknown>;
}

/**
 * Registra um evento na trilha de auditoria. As ações feitas pelo navegador já são registradas por
 * triggers no banco; este registra as feitas pela API (service_role), onde o trigger não sabe quem foi.
 * Falha de auditoria nunca derruba a operação principal: só vira log.
 */
export async function logAudit(
  event: AuditEvent,
  admin: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }> } = getSupabaseAdmin()
): Promise<void> {
  try {
    const { error } = await admin.rpc("log_audit_event", {
      p_org: event.organizationId,
      p_actor: event.actorId ?? null,
      p_actor_name: event.actorName ?? null,
      p_action: event.action,
      p_target_type: event.targetType ?? null,
      p_target_id: event.targetId ?? null,
      p_detail: event.detail ?? {},
    });
    if (error) logger.warn("audit: não foi possível registrar o evento", { action: event.action, error });
  } catch (error) {
    logger.warn("audit: falha ao registrar o evento", { action: event.action, error });
  }
}
