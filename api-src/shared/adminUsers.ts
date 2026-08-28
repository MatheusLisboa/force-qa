import { getSupabaseAdmin } from "./auth";
import { resolveOrganizationId } from "../../src/lib/organizations";

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
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { name, role, squad, organization_id: organizationId },
  });
  if (error) throw error;
  if (!data.user) throw new Error("Falha ao criar usuário no Auth.");

  const { error: profileError } = await admin.from("users").upsert({
    id: data.user.id,
    name,
    email,
    role,
    squad,
    is_guest: false,
    organization_id: organizationId,
  });
  if (profileError) throw profileError;
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
