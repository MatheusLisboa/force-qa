import { getSupabaseAdmin } from "./auth";

function extractRoomToken(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const room = url.searchParams.get("room");
    if (room) return room.trim();
  } catch {
    /* not an absolute URL */
  }
  const match = trimmed.match(/[?&]room=([^&]+)/i);
  if (match) {
    try {
      return decodeURIComponent(match[1]).trim();
    } catch {
      return match[1].trim();
    }
  }
  return trimmed;
}

export async function validateGuestRoom(input: string): Promise<{ id: string; name: string }> {
  const trimmed = extractRoomToken(input);
  if (!trimmed) {
    throw Object.assign(new Error("Cole o link da sala, o ID ou o nome."), { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: byId } = await admin.from("war_rooms").select("id, name, guest_access_disabled").eq("id", trimmed).maybeSingle();
  const row = byId
    ?? (await admin.from("war_rooms").select("id, name, guest_access_disabled").ilike("name", trimmed).limit(1).maybeSingle()).data;

  if (!row) {
    throw Object.assign(new Error("A sala informada não existe. Verifique o ID ou o nome."), { status: 404 });
  }
  if (row.guest_access_disabled) {
    throw Object.assign(new Error("O acesso de convidados para esta sala foi desativado."), { status: 403 });
  }
  return { id: row.id as string, name: row.name as string };
}

export async function joinRoom(
  userId: string,
  input: string,
  isGuest: boolean,
  access?: { organizationId: string; isSuperadmin: boolean }
): Promise<string> {
  const trimmed = extractRoomToken(input);
  if (!trimmed) {
    throw Object.assign(new Error("Cole o link da sala, o ID ou o nome."), { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: byId } = await admin.from("war_rooms").select("id, guest_access_disabled, organization_id").eq("id", trimmed).maybeSingle();
  const row = byId
    ?? (await admin.from("war_rooms").select("id, guest_access_disabled, organization_id").ilike("name", trimmed).limit(1).maybeSingle()).data;

  if (!row) {
    throw Object.assign(new Error("Sala não encontrada. Confira o ID ou o nome."), { status: 404 });
  }
  if (isGuest && row.guest_access_disabled) {
    throw Object.assign(new Error("O acesso de convidados para esta sala foi desativado."), { status: 403 });
  }

  const roomId = row.id as string;
  const roomOrgId = row.organization_id as string | null;

  if (!isGuest) {
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

  if (roomOrgId) {
    await admin.from("users").update({ organization_id: roomOrgId }).eq("id", userId);
  }

  const { error } = await admin.from("room_members").insert({
    war_room_id: roomId,
    user_id: userId,
    added_by: userId,
  });
  if (error && error.code !== "23505") {
    throw error;
  }
  return roomId;
}

export async function inviteToRoom(params: {
  actorId: string;
  actorRole: string;
  actorOrganizationId: string;
  isSuperadmin: boolean;
  roomId: string;
  email: string;
  redirectTo: string;
}): Promise<{ userId: string; invited: boolean; alreadyMember: boolean }> {
  const email = params.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw Object.assign(new Error("Informe um e-mail válido."), { status: 400 });
  }
  if (!["admin", "qa", "scrum_master"].includes(params.actorRole) && !params.isSuperadmin) {
    throw Object.assign(new Error("Apenas admin, QA ou Scrum Master podem convidar."), { status: 403 });
  }

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
      data: { squad: "", name: email.split("@")[0], organization_id: roomOrgId || params.actorOrganizationId },
    });
    if (error) throw error;
    if (!data.user) throw new Error("Falha ao enviar o convite.");
    userId = data.user.id;
    invited = true;
  }

  const { data: already } = await admin
    .from("room_members")
    .select("user_id")
    .eq("war_room_id", params.roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (already) {
    return { userId, invited, alreadyMember: true };
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

  return { userId, invited, alreadyMember: false };
}
