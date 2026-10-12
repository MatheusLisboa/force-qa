import { getSupabaseAdmin } from "./auth";
import { generateExportToken } from "../../src/lib/exportToken";
import { normalizeExportScope, type ExportScope } from "../../src/lib/exportScope";

function missingExportTokenSql(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
  const message =
    error && typeof error === "object" && "message" in error ? String((error as { message?: string }).message || "") : "";
  return code === "42703" || /export_token_|export_room_ids/i.test(message);
}

export function throwIfExportTokenSqlMissing(error: unknown): never {
  if (missingExportTokenSql(error)) {
    throw Object.assign(
      new Error("Aplique as migrations 20260101000016_export_api e 20260101000022_permissions_visibility no Supabase."),
      { status: 500 }
    );
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export async function getExportTokenMeta(organizationId: string): Promise<{
  configured: boolean;
  prefix: string | null;
  createdAt: string | null;
  /** null = todas as salas da organização. */
  roomIds: ExportScope;
}> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("organization_integrations")
    .select("export_token_prefix, export_token_created_at, export_room_ids")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throwIfExportTokenSqlMissing(error);
  const prefix = data?.export_token_prefix ? String(data.export_token_prefix) : null;
  return {
    configured: Boolean(prefix),
    prefix,
    createdAt: data?.export_token_created_at ? String(data.export_token_created_at) : null,
    roomIds: normalizeExportScope(data?.export_room_ids),
  };
}

/** Confere que todas as salas do escopo existem e são da organização (nada de apontar para sala alheia). */
export async function assertRoomsBelongToOrganization(organizationId: string, roomIds: string[]): Promise<void> {
  if (roomIds.length === 0) return;
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("war_rooms").select("id").eq("organization_id", organizationId).in("id", roomIds);
  if (error) throw error;
  const found = new Set((data || []).map((row) => String(row.id)));
  const missing = roomIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw Object.assign(new Error("Há salas no escopo que não pertencem a esta organização."), { status: 400 });
  }
}

export async function setExportScope(organizationId: string, roomIds: ExportScope): Promise<void> {
  if (roomIds) await assertRoomsBelongToOrganization(organizationId, roomIds);
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("organization_integrations")
    .update({ export_room_ids: roomIds, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId);
  if (error) throwIfExportTokenSqlMissing(error);
}

export async function rotateExportToken(
  organizationId: string,
  roomIds: ExportScope = null
): Promise<{ token: string; prefix: string; roomIds: ExportScope }> {
  if (roomIds) await assertRoomsBelongToOrganization(organizationId, roomIds);
  const generated = generateExportToken();
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload = {
    export_token_hash: generated.hash,
    export_token_prefix: generated.prefix,
    export_token_created_at: now,
    export_room_ids: roomIds,
    updated_at: now,
  };

  const { data: existing, error: lookupError } = await admin
    .from("organization_integrations")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await admin
      .from("organization_integrations")
      .update(payload)
      .eq("organization_id", organizationId);
    if (error) throwIfExportTokenSqlMissing(error);
  } else {
    const { error } = await admin.from("organization_integrations").insert({
      organization_id: organizationId,
      ...payload,
    });
    if (error) throwIfExportTokenSqlMissing(error);
  }

  return { token: generated.token, prefix: generated.prefix, roomIds };
}

export async function revokeExportToken(organizationId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("organization_integrations")
    .update({
      export_token_hash: null,
      export_token_prefix: null,
      export_token_created_at: null,
      export_room_ids: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
  if (error) throwIfExportTokenSqlMissing(error);
}
