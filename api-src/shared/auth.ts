import { createClient, SupabaseClient, User } from "@supabase/supabase-js";
import { resolveOrganizationId } from "../../src/lib/organizations";
import {
  actorHasCapability,
  DEFAULT_ROLE_MATRIX,
  matrixFromRows,
  type PermissionCapability,
  type RolePermissionMatrix,
} from "../../src/lib/permissions";

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

  const isGuest = Boolean(profile?.is_guest);
  return {
    user,
    role: (profile?.role as string) || "viewer",
    isGuest,
    organizationId: isGuest
      ? String(profile?.organization_id || "")
      : resolveOrganizationId(profile?.organization_id as string | undefined),
    isSuperadmin: Boolean(profile?.is_superadmin),
  };
}

export async function loadRolePermissionMatrix(): Promise<RolePermissionMatrix> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("role_permissions").select("role, capability, allowed");
  if (error || !data?.length) return DEFAULT_ROLE_MATRIX;
  return matrixFromRows(data);
}

function actorFromAuthed(authed: AuthedUser) {
  return { role: authed.role, isSuperadmin: authed.isSuperadmin, isGuest: authed.isGuest };
}

export async function requireCapability(
  authHeader: string | undefined,
  capability: PermissionCapability
): Promise<AuthedUser> {
  const authed = await requireUser(authHeader);
  const matrix = await loadRolePermissionMatrix();
  if (!actorHasCapability(actorFromAuthed(authed), capability, matrix)) {
    throw Object.assign(new Error("Você não tem permissão para esta operação."), { status: 403 });
  }
  return authed;
}

export async function requireAdmin(authHeader: string | undefined): Promise<AuthedUser> {
  return requireCapability(authHeader, "manage_users");
}

export async function requireIntegrationsManager(authHeader: string | undefined): Promise<AuthedUser> {
  return requireCapability(authHeader, "manage_integrations");
}

export async function requireSuperadmin(authHeader: string | undefined): Promise<AuthedUser> {
  const authed = await requireUser(authHeader);
  if (!authed.isSuperadmin) {
    throw Object.assign(new Error("Apenas o superadmin pode executar esta operação."), { status: 403 });
  }
  return authed;
}

const AI_WINDOW_MS = 10 * 60 * 1000;
const AI_MAX_HITS = 20;
const aiHits = new Map<string, number[]>();

export function assertAiRateLimit(userId: string): void {
  const now = Date.now();
  const recent = (aiHits.get(userId) || []).filter((t) => now - t < AI_WINDOW_MS);
  if (recent.length >= AI_MAX_HITS) {
    throw Object.assign(new Error("Muitas solicitações de IA. Tente de novo em alguns minutos."), {
      status: 429,
    });
  }
  recent.push(now);
  aiHits.set(userId, recent);
}

/** Viewer/guest cannot spend AI quota unless the matrix allows it. */
export async function requireAiUser(authHeader: string | undefined): Promise<AuthedUser> {
  const authed = await requireUser(authHeader);
  const matrix = await loadRolePermissionMatrix();
  if (!actorHasCapability(actorFromAuthed(authed), "use_ai", matrix)) {
    throw Object.assign(new Error("Apenas quem escreve cards pode usar a IA."), { status: 403 });
  }
  assertAiRateLimit(authed.user.id);
  return authed;
}

export function httpErrorStatus(error: unknown, fallback = 500): number {
  if (error && typeof error === "object") {
    if ("status" in error && typeof (error as { status: unknown }).status === "number") {
      return (error as { status: number }).status;
    }
    const code = String((error as { code?: unknown }).code || "");
    if (code === "42501") return 403;
    if (code === "23505" || code === "email_exists" || code === "user_already_exists") return 409;
    if (code === "23503" || code === "22P02") return 400;
  }
  return fallback;
}

export function clientErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "object") {
    const obj = error as { message?: unknown; details?: unknown; hint?: unknown; error?: unknown };
    for (const value of [obj.message, obj.details, obj.hint, obj.error]) {
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return fallback;
}

export function wrapThrownError(error: unknown, fallback: string): Error {
  const wrapped = new Error(clientErrorMessage(error, fallback));
  Object.assign(wrapped, { status: httpErrorStatus(error), cause: error });
  return wrapped;
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
