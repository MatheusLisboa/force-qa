import { randomBytes } from "crypto";
import { getSupabaseAdmin, loadRolePermissionMatrix } from "./auth";
import { actorHasCapability } from "../../src/lib/permissions";
import { resolveInviteRole } from "../../src/lib/inviteRole";
import { looksLikeGuestToken } from "../../src/lib/guestInvite";
import { parseGuestInvite } from "../../src/lib/routes";
import type { UserRole } from "../../src/types";

function newGuestInviteToken(): string {
  return `gst_${randomBytes(18).toString("base64url")}`;
}

async function roomFromGuestToken(
  token: string
): Promise<{ id: string; name: string; guest_access_disabled: boolean } | null> {
  if (!looksLikeGuestToken(token)) return null;
  const admin = getSupabaseAdmin();
  const { data: invite } = await admin
    .from("room_guest_invites")
    .select("war_room_id")
    .eq("token", token)
    .maybeSingle();
  if (!invite?.war_room_id) return null;
  const { data: room } = await admin
    .from("war_rooms")
    .select("id, name, guest_access_disabled")
    .eq("id", invite.war_room_id)
    .maybeSingle();
  return room as { id: string; name: string; guest_access_disabled: boolean } | null;
}

export async function validateGuestRoom(input: string): Promise<{ id: string; name: string }> {
  const parsed = parseGuestInvite(input);
  if (!parsed.token) {
    throw Object.assign(new Error("Cole o link de convite completo, não só o ID da sala."), { status: 400 });
  }

  const room = await roomFromGuestToken(parsed.token);
  if (!room || room.guest_access_disabled) {
    throw Object.assign(new Error("Convite inválido ou convidados bloqueados nesta sala."), { status: 404 });
  }
  if (parsed.roomId && parsed.roomId !== room.id) {
    throw Object.assign(new Error("Convite inválido ou convidados bloqueados nesta sala."), { status: 404 });
  }
  return { id: room.id, name: room.name };
}

const GUEST_JOIN_WINDOW_MS = 10 * 60 * 1000;
const GUEST_JOIN_MAX = 8;
const guestJoinHits = new Map<string, number[]>();

function assertGuestJoinRateLimit(token: string): void {
  const now = Date.now();
  const recent = (guestJoinHits.get(token) || []).filter((t) => now - t < GUEST_JOIN_WINDOW_MS);
  if (recent.length >= GUEST_JOIN_MAX) {
    throw Object.assign(new Error("Muitos acessos neste convite. Tente de novo em alguns minutos."), {
      status: 429,
    });
  }
  recent.push(now);
  guestJoinHits.set(token, recent);
}

export async function joinAsGuest(params: {
  input: string;
  name: string;
  squad: string;
}): Promise<{ roomId: string; email: string; password: string }> {
  const name = params.name.trim();
  const squad = params.squad.trim();
  if (!name || !squad) {
    throw Object.assign(new Error("Informe nome e área."), { status: 400 });
  }
  const parsed = parseGuestInvite(params.input);
  if (!parsed.token) {
    throw Object.assign(new Error("Cole o link de convite completo, não só o ID da sala."), { status: 400 });
  }
  assertGuestJoinRateLimit(parsed.token);
  const room = await validateGuestRoom(params.input);

  const admin = getSupabaseAdmin();
  const email = `guest_${Date.now()}_${randomBytes(4).toString("hex")}@guest.forceqa.local`;
  const password = `gst_${randomBytes(18).toString("base64url")}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { guest: true, role: "viewer" },
    user_metadata: { name, squad, is_guest: true },
  });
  if (error || !data.user) {
    throw Object.assign(new Error("Não foi possível abrir a sessão de convidado."), { status: 500 });
  }

  await admin.from("users").upsert({
    id: data.user.id,
    name,
    email,
    role: "viewer",
    squad,
    is_guest: true,
    organization_id: null,
  });

  const { error: memberError } = await admin.from("room_members").insert({
    war_room_id: room.id,
    user_id: data.user.id,
    added_by: data.user.id,
  });
  if (memberError && memberError.code !== "23505") throw memberError;

  return { roomId: room.id, email, password };
}

export async function getGuestInviteToken(roomId: string): Promise<string> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("room_guest_invites").select("token").eq("war_room_id", roomId).maybeSingle();
  if (data?.token) return String(data.token);
  const token = newGuestInviteToken();
  const { error } = await admin.from("room_guest_invites").insert({ war_room_id: roomId, token });
  if (error && error.code !== "23505") throw error;
  if (error?.code === "23505") {
    const { data: again } = await admin.from("room_guest_invites").select("token").eq("war_room_id", roomId).maybeSingle();
    return String(again?.token || token);
  }
  return token;
}

export async function rotateGuestInviteToken(roomId: string): Promise<string> {
  const token = newGuestInviteToken();
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("room_guest_invites").upsert({
    war_room_id: roomId,
    token,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
  return token;
}

export async function joinRoom(
  userId: string,
  input: string,
  isGuest: boolean,
  access?: { organizationId: string; isSuperadmin: boolean }
): Promise<string> {
  const admin = getSupabaseAdmin();

  if (isGuest) {
    const room = await validateGuestRoom(input);
    const { error } = await admin.from("room_members").insert({
      war_room_id: room.id,
      user_id: userId,
      added_by: userId,
    });
    if (error && error.code !== "23505") throw error;
    return room.id;
  }

  const parsed = parseGuestInvite(input);
  const trimmed = parsed.roomId;
  if (!trimmed) {
    throw Object.assign(new Error("Cole o link da sala ou o ID."), { status: 400 });
  }

  const { data: byId } = await admin.from("war_rooms").select("id, guest_access_disabled, organization_id").eq("id", trimmed).maybeSingle();

  if (!byId) {
    throw Object.assign(new Error("Sala não encontrada. Confira o link ou o ID."), { status: 404 });
  }

  const roomId = byId.id as string;
  const roomOrgId = byId.organization_id as string | null;

  if (
    !access?.isSuperadmin
    && roomOrgId
    && access?.organizationId
    && roomOrgId !== access.organizationId
  ) {
    throw Object.assign(new Error("Esta sala pertence a outra organização."), { status: 403 });
  }
  const { data: membership } = await admin
    .from("room_members")
    .select("user_id")
    .eq("war_room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership) return roomId;
  throw Object.assign(
    new Error("Você não tem acesso a esta sala. Peça a um admin para adicionar você em Usuários."),
    { status: 403 }
  );
}

export async function inviteToRoom(params: {
  actorId: string;
  actorRole: string;
  actorOrganizationId: string;
  isSuperadmin: boolean;
  isGuest?: boolean;
  roomId: string;
  email: string;
  role?: string;
  redirectTo: string;
}): Promise<{
  userId: string;
  invited: boolean;
  alreadyMember: boolean;
  roleApplied: UserRole | null;
}> {
  const email = params.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw Object.assign(new Error("Informe um e-mail válido."), { status: 400 });
  }
  const matrix = await loadRolePermissionMatrix();
  if (
    !actorHasCapability(
      { role: params.actorRole, isSuperadmin: params.isSuperadmin, isGuest: params.isGuest },
      "invite_members",
      matrix
    )
  ) {
    throw Object.assign(new Error("Você não pode convidar pessoas para esta sala."), { status: 403 });
  }
  const inviteRole = resolveInviteRole(params.role, params.actorRole, params.isSuperadmin);

  const admin = getSupabaseAdmin();
  const { data: room } = await admin.from("war_rooms").select("id, name, organization_id").eq("id", params.roomId).maybeSingle();
  if (!room) {
    throw Object.assign(new Error("Sala não encontrada."), { status: 404 });
  }
  const roomOrgId = room.organization_id as string | null;
  if (
    !params.isSuperadmin
    && roomOrgId
    && roomOrgId !== params.actorOrganizationId
  ) {
    throw Object.assign(new Error("Esta sala pertence a outra organização."), { status: 403 });
  }

  if (params.actorRole !== "admin" && !params.isSuperadmin) {
    const { data: membership } = await admin
      .from("room_members")
      .select("user_id")
      .eq("war_room_id", params.roomId)
      .eq("user_id", params.actorId)
      .maybeSingle();
    if (!membership) {
      throw Object.assign(new Error("Você precisa ser membro da sala para convidar."), { status: 403 });
    }
  }

  const { data: existingProfile } = await admin
    .from("users")
    .select("id, organization_id")
    .eq("email", email)
    .maybeSingle();

  let userId = existingProfile?.id as string | undefined;
  let invited = false;

  if (existingProfile && roomOrgId && existingProfile.organization_id && existingProfile.organization_id !== roomOrgId && !params.isSuperadmin) {
    throw Object.assign(new Error("Este e-mail pertence a outra organização."), { status: 403 });
  }

  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: params.redirectTo,
      data: { squad: "", name: email.split("@")[0], role: inviteRole },
    });
    if (error) throw error;
    if (!data.user) throw new Error("Falha ao enviar o convite.");
    userId = data.user.id;
    invited = true;
    const orgForUser = roomOrgId || params.actorOrganizationId;
    const { error: metaError } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role: inviteRole, organization_id: orgForUser },
    });
    if (metaError) throw metaError;
    const { error: profileError } = await admin
      .from("users")
      .update({ organization_id: orgForUser, role: inviteRole })
      .eq("id", userId);
    if (profileError) throw profileError;
  }

  const { data: already } = await admin
    .from("room_members")
    .select("user_id")
    .eq("war_room_id", params.roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (already) {
    return { userId, invited, alreadyMember: true, roleApplied: invited ? inviteRole : null };
  }

  const { error: memberError } = await admin.from("room_members").insert({
    war_room_id: params.roomId,
    user_id: userId,
    added_by: params.actorId,
  });
  if (memberError && memberError.code !== "23505") throw memberError;

  const { error: notifError } = await admin.from("notifications").insert({
    user_id: userId,
    type: "room_invite",
    title: `Você foi adicionado à sala ${room.name}`,
    body: "Abra o ForceQA para entrar no Kanban.",
    war_room_id: params.roomId,
  });
  if (notifError) {
    console.error("invite notification:", notifError);
  }

  return { userId, invited, alreadyMember: false, roleApplied: invited ? inviteRole : null };
}

export async function assertActorCanAccessRoom(
  actor: { id: string; role: string; organizationId: string; isSuperadmin: boolean; isGuest: boolean },
  roomId: string
): Promise<void> {
  if (!roomId) {
    throw Object.assign(new Error("ID da sala é obrigatório."), { status: 400 });
  }
  const admin = getSupabaseAdmin();
  const { data: room } = await admin.from("war_rooms").select("id, organization_id").eq("id", roomId).maybeSingle();
  if (!room) {
    throw Object.assign(new Error("Sala não encontrada."), { status: 404 });
  }
  if (actor.isSuperadmin) return;

  const { data: membership } = await admin
    .from("room_members")
    .select("user_id")
    .eq("war_room_id", roomId)
    .eq("user_id", actor.id)
    .maybeSingle();

  if (actor.isGuest) {
    if (!membership) {
      throw Object.assign(new Error("Você não tem acesso a esta sala."), { status: 403 });
    }
    return;
  }

  const roomOrgId = room.organization_id as string | null;
  if (roomOrgId && roomOrgId !== actor.organizationId) {
    throw Object.assign(new Error("Esta sala pertence a outra organização."), { status: 403 });
  }
  if (actor.role === "admin") return;
  if (!membership) {
    throw Object.assign(new Error("Você precisa ser membro da sala."), { status: 403 });
  }
}

