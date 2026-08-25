import { getSupabaseAdmin } from "./auth";

const ALLOWED_ROLES = ["admin", "qa", "developer", "dba", "devops", "scrum_master", "viewer"] as const;

export async function adminCreateUser(params: {
  name: string;
  email: string;
  password: string;
  role: string;
  squad: string;
}): Promise<string> {
  const name = params.name.trim();
  const email = params.email.trim().toLowerCase();
  const role = params.role.trim();
  const squad = params.squad.trim();

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
    user_metadata: { name, role, squad },
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
  });
  if (profileError) throw profileError;
  return data.user.id;
}

export async function adminDeleteUser(userId: string): Promise<void> {
  if (!userId) {
    throw Object.assign(new Error("ID do usuário é obrigatório."), { status: 400 });
  }
  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}
