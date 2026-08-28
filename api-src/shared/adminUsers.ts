import { getSupabaseAdmin, wrapThrownError } from "./auth";
import { DEFAULT_ORGANIZATION_ID, resolveOrganizationId } from "../../src/lib/organizations";

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return String((error as { code?: unknown }).code || "");
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "");
  return String((error as { message?: unknown }).message || "");
}

function isEmailTakenError(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return (
    code === "email_exists" ||
    code === "user_already_exists" ||
    message.includes("already been registered") ||
    message.includes("user already registered")
  );
}

const ALLOWED_ROLES = ["admin", "qa", "developer", "dba", "devops", "scrum_master", "viewer"] as const;

export async function adminCreateUser(params: {
  name: string;
  email: string;
  password: string;
  role: string;
  squad: string;
  organizationId?: string | null;
}): Promise<string> {
  const name = params.name.trim();
  const email = params.email.trim().toLowerCase();
  const role = params.role.trim();
  const squad = params.squad.trim();
  const organizationId = resolveOrganizationId(params.organizationId);

  if (!name || !email || !params.password || !role || !squad) {
    throw Object.assign(new Error("Todos os campos são obrigatórios."), { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    throw Object.assign(new Error("Papel inválido."), { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: existingProfile } = await admin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    throw Object.assign(new Error("Este e-mail já está cadastrado."), { status: 409 });
  }

  // The Auth trigger inserts public.users in the same transaction. A brand-new
  // organization_id in metadata can fail that insert; GoTrue then reports it as
  // "email already registered". Stamp the default org at signup, then move.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: {
      name,
      role,
      squad,
      organization_id: DEFAULT_ORGANIZATION_ID,
    },
  });
  if (error) {
    console.error("adminCreateUser auth:", { code: errorCode(error), message: errorMessage(error) });
    if (isEmailTakenError(error)) {
      throw Object.assign(new Error("Este e-mail já está cadastrado."), { status: 409 });
    }
    throw Object.assign(new Error(errorMessage(error) || "Falha ao criar usuário no Auth."), {
      status: 500,
    });
  }
  if (!data.user) throw new Error("Falha ao criar usuário no Auth.");

  const { data: moved, error: profileError } = await admin
    .from("users")
    .update({
      name,
      email,
      squad,
      is_guest: false,
      organization_id: organizationId,
    })
    .eq("id", data.user.id)
    .select("id")
    .maybeSingle();
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw wrapThrownError(profileError, "Falha ao salvar o perfil do admin.");
  }
  if (!moved) {
    const { error: insertProfileError } = await admin.from("users").upsert({
      id: data.user.id,
      name,
      email,
      role,
      squad,
      is_guest: false,
      organization_id: organizationId,
    });
    if (insertProfileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw wrapThrownError(insertProfileError, "Falha ao salvar o perfil do admin.");
    }
  }

  const { error: roleError } = await admin.from("users").update({ role }).eq("id", data.user.id);
  if (roleError) {
    console.error("adminCreateUser role:", { code: errorCode(roleError), message: errorMessage(roleError) });
  }
  return data.user.id;
}

export async function adminDeleteUser(
  userId: string,
  actor: { id: string; organizationId: string; isSuperadmin: boolean }
): Promise<void> {
  if (!userId) {
    throw Object.assign(new Error("ID do usuário é obrigatório."), { status: 400 });
  }
  if (userId === actor.id) {
    throw Object.assign(new Error("Você não pode remover a própria conta."), { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: target, error: lookupError } = await admin
    .from("users")
    .select("id, organization_id, is_superadmin")
    .eq("id", userId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!target) {
    throw Object.assign(new Error("Usuário não encontrado."), { status: 404 });
  }
  if (target.is_superadmin && !actor.isSuperadmin) {
    throw Object.assign(new Error("Não é possível remover o superadmin."), { status: 403 });
  }
  if (!actor.isSuperadmin && target.organization_id !== actor.organizationId) {
    throw Object.assign(new Error("Este usuário pertence a outra organização."), { status: 403 });
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
