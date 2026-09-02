import { getSupabaseAdmin } from "./auth";
import { generateExportToken } from "../../src/lib/exportToken";

function missingExportTokenSql(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code || "") : "";
  const message =
    error && typeof error === "object" && "message" in error ? String((error as { message?: string }).message || "") : "";
  return code === "42703" || /export_token_/i.test(message);
}

export function throwIfExportTokenSqlMissing(error: unknown): never {
  if (missingExportTokenSql(error)) {
    throw Object.assign(
      new Error("Rode supabase/migration_export_api.sql no SQL Editor do Supabase."),
      { status: 500 }
    );
  }
  throw error instanceof Error ? error : new Error(String(error));
}

export async function getExportTokenMeta(organizationId: string): Promise<{
  configured: boolean;
  prefix: string | null;
  createdAt: string | null;
}> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("organization_integrations")
    .select("export_token_prefix, export_token_created_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throwIfExportTokenSqlMissing(error);
  const prefix = data?.export_token_prefix ? String(data.export_token_prefix) : null;
  return {
    configured: Boolean(prefix),
    prefix,
    createdAt: data?.export_token_created_at ? String(data.export_token_created_at) : null,
  };
}

export async function rotateExportToken(
  organizationId: string
): Promise<{ token: string; prefix: string }> {
  const generated = generateExportToken();
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const payload = {
    export_token_hash: generated.hash,
    export_token_prefix: generated.prefix,
    export_token_created_at: now,
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

  return { token: generated.token, prefix: generated.prefix };
}

export async function revokeExportToken(organizationId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("organization_integrations")
    .update({
      export_token_hash: null,
      export_token_prefix: null,
      export_token_created_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);
  if (error) throwIfExportTokenSqlMissing(error);
}
