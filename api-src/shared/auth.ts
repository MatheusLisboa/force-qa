import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { resolveOrganizationId } from "../../src/lib/organizations";

export function envVar(key: string): string | undefined {
  const raw = process.env[key];
  if (!raw) return undefined;
  return raw.trim().replace(/^["']|["']$/g, "");
}

export function getSupabaseAdmin(): SupabaseClient {
  const url = envVar("VITE_SUPABASE_URL") || envVar("SUPABASE_URL") || "";
  const key = envVar("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL são obrigatórios para operações de servidor.");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface AuthedUser {
  user: User;
  role: string;
  isGuest: boolean;
  organizationId: string;
  isSuperadmin: boolean;
}

export async function requireUser(authHeader: string | undefined): Promise<AuthedUser> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Token de autenticação ausente."), { status: 401 });
  }
  const token = authHeader.slice(7);
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    throw Object.assign(new Error("Sessão inválida ou expirada."), { status: 401 });
  }

  const { data: profile } = await admin
    .from("users")
    .select("role, is_guest, organization_id, is_superadmin")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    role: (profile?.role as string) || "viewer",
    isGuest: Boolean(profile?.is_guest),
    organizationId: resolveOrganizationId(profile?.organization_id as string | undefined),
    isSuperadmin: Boolean(profile?.is_superadmin),
  };
}

export async function requireAdmin(authHeader: string | undefined): Promise<AuthedUser> {
  const authed = await requireUser(authHeader);
  if (authed.role !== "admin" && !authed.isSuperadmin) {
    throw Object.assign(new Error("Apenas administradores podem executar esta operação."), { status: 403 });
  }
  return authed;
}

export async function requireSuperadmin(authHeader: string | undefined): Promise<AuthedUser> {
  const authed = await requireUser(authHeader);
  if (!authed.isSuperadmin) {
    throw Object.assign(new Error("Apenas o superadmin pode executar esta operação."), { status: 403 });
  }
  return authed;
}

export function httpErrorStatus(error: unknown, fallback = 500): number {
  if (error && typeof error === "object" && "status" in error && typeof (error as { status: unknown }).status === "number") {
    return (error as { status: number }).status;
  }
  return fallback;
}

export function readJsonBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof body === "object") return body as Record<string, unknown>;
  return {};
}
