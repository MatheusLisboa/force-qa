var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api-src/rooms/invite.ts
var invite_exports = {};
__export(invite_exports, {
  default: () => handler
});
module.exports = __toCommonJS(invite_exports);

// api-src/shared/auth.ts
var import_supabase_js = require("@supabase/supabase-js");
function envVar(key) {
  const raw = process.env[key];
  if (!raw) return void 0;
  return raw.trim().replace(/^["']|["']$/g, "");
}
function getSupabaseAdmin() {
  const url = envVar("VITE_SUPABASE_URL") || envVar("SUPABASE_URL") || "";
  const key = envVar("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL s\xE3o obrigat\xF3rios para opera\xE7\xF5es de servidor.");
  }
  return (0, import_supabase_js.createClient)(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
async function requireUser(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Token de autentica\xE7\xE3o ausente."), { status: 401 });
  }
  const token = authHeader.slice(7);
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    throw Object.assign(new Error("Sess\xE3o inv\xE1lida ou expirada."), { status: 401 });
  }
  const { data: profile } = await admin.from("users").select("role, is_guest").eq("id", user.id).maybeSingle();
  return {
    user,
    role: profile?.role || "viewer",
    isGuest: Boolean(profile?.is_guest)
  };
}
function httpErrorStatus(error, fallback = 500) {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return fallback;
}
function readJsonBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof body === "object") return body;
  return {};
}

// api-src/shared/rooms.ts
async function inviteToRoom(params) {
  const email = params.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw Object.assign(new Error("Informe um e-mail v\xE1lido."), { status: 400 });
  }
  if (!["admin", "qa", "scrum_master"].includes(params.actorRole)) {
    throw Object.assign(new Error("Apenas admin, QA ou Scrum Master podem convidar."), { status: 403 });
  }
  const admin = getSupabaseAdmin();
  const { data: room } = await admin.from("war_rooms").select("id, name").eq("id", params.roomId).maybeSingle();
  if (!room) {
    throw Object.assign(new Error("Sala n\xE3o encontrada."), { status: 404 });
  }
  if (params.actorRole !== "admin") {
    const { data: membership } = await admin.from("room_members").select("user_id").eq("war_room_id", params.roomId).eq("user_id", params.actorId).maybeSingle();
    if (!membership) {
      throw Object.assign(new Error("Voc\xEA precisa ser membro da sala para convidar."), { status: 403 });
    }
  }
  const { data: existingProfile } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  let userId = existingProfile?.id;
  let invited = false;
  if (!userId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: params.redirectTo,
      data: { squad: "", name: email.split("@")[0] }
    });
    if (error) throw error;
    if (!data.user) throw new Error("Falha ao enviar o convite.");
    userId = data.user.id;
    invited = true;
  }
  const { data: already } = await admin.from("room_members").select("user_id").eq("war_room_id", params.roomId).eq("user_id", userId).maybeSingle();
  if (already) {
    return { userId, invited, alreadyMember: true };
  }
  const { error: memberError } = await admin.from("room_members").insert({
    war_room_id: params.roomId,
    user_id: userId,
    added_by: params.actorId
  });
  if (memberError && memberError.code !== "23505") throw memberError;
  const { error: notifError } = await admin.from("notifications").insert({
    user_id: userId,
    type: "room_invite",
    title: `Voc\xEA foi adicionado \xE0 sala ${room.name}`,
    body: "Abra o ForceQA para entrar no Kanban.",
    war_room_id: params.roomId
  });
  if (notifError) {
    console.error("invite notification:", notifError);
  }
  return { userId, invited, alreadyMember: false };
}

// api-src/rooms/invite.ts
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const authed = await requireUser(req.headers.authorization);
    const body = readJsonBody(req.body);
    const origin = String(req.headers.origin || process.env.APP_URL || "https://force-qa.vercel.app");
    const result = await inviteToRoom({
      actorId: authed.user.id,
      actorRole: authed.role,
      roomId: String(body.roomId || ""),
      email: String(body.email || ""),
      redirectTo: `${origin.replace(/\/$/, "")}/`
    });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar convite.";
    console.error("rooms/invite:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
module.exports = module.exports.default || module.exports;
