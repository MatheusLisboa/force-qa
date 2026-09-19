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

function isAuthDatabaseError(error: unknown): boolean {
  const message = errorMessage(error).trim();
  const code = errorCode(error).toLowerCase();
  return (
    !message ||
    message === "{}" ||
    /database error creating new user/i.test(message) ||
    code === "unexpected_failure"
  );
}

function formatCreateUserError(error: unknown): string {
  if (isAuthDatabaseError(error)) {
    return "O Auth recusou criar o usuário. Rode de novo supabase/migration_public_signup.sql no SQL Editor (versão com EXCEPTION) e, se o e-mail já aparecer em Authentication → Users, apague-o antes de tentar de novo.";
  }
  return errorMessage(error).trim() || "Não foi possível criar a conta.";
}

const ALLOWED_ROLES = ["admin", "qa", "developer", "dba", "devops", "scrum_master", "viewer"] as const;

async function findAuthUserIdByEmail(
  admin: ReturnType<typeof getSupabaseAdmin>,
  email: string
): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = (data.users || []).find((user) => (user.email || "").toLowerCase() === email);
    if (match) return match.id;
    if (!data.users || data.users.length < 200) break;
  }
  return null;
}

async function roomCountForUser(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<number> {
  const { count, error } = await admin
    .from("room_members")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count || 0;
}

export async function adminCreateUser(params: {
  name: string;
  email: string;
  password: string;
  role: string;
  squad: string;
  organizationId?: string | null;
  adoptOrphan?: boolean;
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
    .select("id, organization_id, role, squad, is_superadmin")
    .eq("email", email)
    .maybeSingle();
  if (existingProfile) {
    if (
      params.adoptOrphan &&
      (await adoptOrphanProfile(admin, existingProfile, {
        name,
        email,
        password: params.password,
        role,
        squad,
        organizationId,
      }))
    ) {
      return existingProfile.id as string;
    }
    throw Object.assign(
      new Error("Este e-mail já está cadastrado. Apague o usuário em Authentication → Users (e em Usuários, se aparecer) e tente de novo."),
      { status: 409 }
    );
  }

  // Do not put organization_id in app_metadata: a missing org aborts the Auth
  // trigger and GoTrue reports "{}" / "email already registered". Stamp the
  // default org in the trigger, then move the profile with the service role.
  const authPayload = {
    email,
    password: params.password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: {
      name,
      squad,
      role,
    },
  };
  let { data, error } = await admin.auth.admin.createUser(authPayload);
  if (error && (isEmailTakenError(error) || isAuthDatabaseError(error))) {
    const orphanId = await findAuthUserIdByEmail(admin, email);
    if (orphanId) {
      const { data: profile } = await admin.from("users").select("id").eq("id", orphanId).maybeSingle();
      if (!profile) {
        await admin.auth.admin.deleteUser(orphanId);
        ({ data, error } = await admin.auth.admin.createUser(authPayload));
      } else if (params.adoptOrphan) {
        await stampAdoptedUser(admin, orphanId, {
          name,
          password: params.password,
          role,
          squad,
          organizationId,
        });
        return orphanId;
      }
    }
  }
  if (error) {
    console.error("adminCreateUser auth:", { code: errorCode(error), message: errorMessage(error), error });
    if (isEmailTakenError(error)) {
      throw Object.assign(
        new Error("Este e-mail já existe no Auth. Apague-o em Authentication → Users e tente de novo."),
        { status: 409 }
      );
    }
    throw Object.assign(new Error(formatCreateUserError(error)), { status: 500 });
  }
  if (!data.user) throw new Error("Falha ao criar usuário no Auth.");

  const { data: profile } = await admin.from("users").select("id").eq("id", data.user.id).maybeSingle();
  if (!profile) {
    const { error: insertError } = await admin.from("users").insert({
      id: data.user.id,
      name,
      email,
      role,
      squad,
      is_guest: false,
      organization_id: organizationId,
    });
    if (insertError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw wrapThrownError(insertError, "Falha ao salvar o perfil.");
    }
  } else {
    const { error: profileError } = await admin
      .from("users")
      .update({
        name,
        email,
        squad,
        is_guest: false,
        organization_id: organizationId,
      })
      .eq("id", data.user.id);
    if (profileError) throw wrapThrownError(profileError, "Falha ao salvar o perfil.");
  }

  const { error: roleError } = await admin.from("users").update({ role }).eq("id", data.user.id);
  if (roleError) {
    console.error("adminCreateUser role:", { code: errorCode(roleError), message: errorMessage(roleError) });
  }
  return data.user.id;
}

async function adoptOrphanProfile(
  admin: ReturnType<typeof getSupabaseAdmin>,
  profile: {
    id: string;
    organization_id?: string | null;
    role?: string | null;
    squad?: string | null;
    is_superadmin?: boolean | null;
  },
  params: {
    name: string;
    email: string;
    password: string;
    role: string;
    squad: string;
    organizationId: string;
  }
): Promise<boolean> {
  if (profile.is_superadmin) return false;
  const currentOrg = resolveOrganizationId(profile.organization_id);
  const targetOrg = params.organizationId;
  if (currentOrg === targetOrg) {
    await stampAdoptedUser(admin, profile.id, params);
    return true;
  }
  if (currentOrg !== DEFAULT_ORGANIZATION_ID) return false;
  if ((await roomCountForUser(admin, profile.id)) > 0) return false;
  await stampAdoptedUser(admin, profile.id, params);
  return true;
}

async function stampAdoptedUser(
  admin: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  params: {
    name: string;
    password: string;
    role: string;
    squad: string;
    organizationId: string;
  }
): Promise<void> {
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    password: params.password,
    email_confirm: true,
    app_metadata: { role: params.role, organization_id: params.organizationId },
    user_metadata: {
      name: params.name,
      squad: params.squad,
    },
  });
  if (authError) throw wrapThrownError(authError, "Falha ao atualizar o admin no Auth.");

  const { error: profileError } = await admin
    .from("users")
    .update({
      name: params.name,
      squad: params.squad,
      is_guest: false,
      organization_id: params.organizationId,
    })
    .eq("id", userId);
  if (profileError) throw wrapThrownError(profileError, "Falha ao mover o admin para a organização.");

  const { error: roleError } = await admin.from("users").update({ role: params.role }).eq("id", userId);
  if (roleError) {
    console.error("adoptOrphan role:", { code: errorCode(roleError), message: errorMessage(roleError) });
  }
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

export async function adminMoveUser(params: {
  isSuperadmin: boolean;
  userId: string;
  organizationId: string;
}): Promise<void> {
  if (!params.isSuperadmin) {
    throw Object.assign(new Error("Apenas o superadmin pode mover usuários entre organizações."), {
      status: 403,
    });
  }
  const userId = params.userId.trim();
  const organizationId = resolveOrganizationId(params.organizationId);
  if (!userId) {
    throw Object.assign(new Error("ID do usuário é obrigatório."), { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  if (orgError) throw wrapThrownError(orgError, "Falha ao verificar a organização.");
  if (!org) {
    throw Object.assign(new Error("Organização não encontrada."), { status: 404 });
  }

  const { data: target, error: lookupError } = await admin
    .from("users")
    .select("id, organization_id, is_superadmin")
    .eq("id", userId)
    .maybeSingle();
  if (lookupError) throw wrapThrownError(lookupError, "Falha ao localizar o usuário.");
  if (!target) {
    throw Object.assign(new Error("Usuário não encontrado."), { status: 404 });
  }

  const currentOrg = resolveOrganizationId(target.organization_id);
  if (currentOrg === organizationId) return;

  const { error: moveError } = await admin
    .from("users")
    .update({ organization_id: organizationId })
    .eq("id", userId);
  if (moveError) throw wrapThrownError(moveError, "Falha ao mover o usuário.");

  const { data: memberships, error: memberError } = await admin
    .from("room_members")
    .select("war_room_id")
    .eq("user_id", userId);
  if (memberError) throw wrapThrownError(memberError, "Falha ao ler as salas do usuário.");

  const roomIds = (memberships || []).map((row) => row.war_room_id as string).filter(Boolean);
  if (roomIds.length === 0) return;

  const { data: foreignRooms, error: roomsError } = await admin
    .from("war_rooms")
    .select("id")
    .in("id", roomIds)
    .neq("organization_id", organizationId);
  if (roomsError) throw wrapThrownError(roomsError, "Falha ao filtrar as salas da organização anterior.");

  const toRemove = (foreignRooms || []).map((row) => row.id as string);
  if (toRemove.length === 0) return;

  const { error: detachError } = await admin
    .from("room_members")
    .delete()
    .eq("user_id", userId)
    .in("war_room_id", toRemove);
  if (detachError) throw wrapThrownError(detachError, "Falha ao remover o acesso das salas da organização anterior.");
}
