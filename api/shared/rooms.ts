import { getSupabaseAdmin } from "./auth";

export async function validateGuestRoom(input: string): Promise<{ id: string; name: string }> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw Object.assign(new Error("Informe o ID ou o nome da sala."), { status: 400 });
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

export async function joinRoom(userId: string, input: string, isGuest: boolean): Promise<string> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw Object.assign(new Error("Informe o ID ou o nome da sala."), { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: byId } = await admin.from("war_rooms").select("id, guest_access_disabled").eq("id", trimmed).maybeSingle();
  const row = byId
    ?? (await admin.from("war_rooms").select("id, guest_access_disabled").ilike("name", trimmed).limit(1).maybeSingle()).data;

  if (!row) {
    throw Object.assign(new Error("Sala não encontrada. Confira o ID ou o nome."), { status: 404 });
  }
  if (isGuest && row.guest_access_disabled) {
    throw Object.assign(new Error("O acesso de convidados para esta sala foi desativado."), { status: 403 });
  }

  const roomId = row.id as string;

  if (!isGuest) {
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
  roomId: string;
  email: string;
  redirectTo: string;
}): Promise<{ userId: string; invited: boolean; alreadyMember: boolean }> {
  const email = params.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw Object.assign(new Error("Informe um e-mail válido."), { status: 400 });
  }
  if (!["admin", "qa", "scrum_master"].includes(params.actorRole)) {
    throw Object.assign(new Error("Apenas admin, QA ou Scrum Master podem convidar."), { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data: room } = await admin.from("war_rooms").select("id, name").eq("id", params.roomId).maybeSingle();
  if (!room) {
    throw Object.assign(new Error("Sala não encontrada."), { status: 404 });
  }

  if (params.actorRole !== "admin") {
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
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let userId = existingProfile?.id as string | undefined;
  let invited = false;

  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: params.redirectTo,
      data: { squad: "", name: email.split("@")[0] },
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
