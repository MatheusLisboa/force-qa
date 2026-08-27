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

// api-src/rooms/join.ts
var join_exports = {};
__export(join_exports, {
  default: () => handler
});
module.exports = __toCommonJS(join_exports);

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
function extractRoomToken(input) {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const room = url.searchParams.get("room");
    if (room) return room.trim();
  } catch {
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
async function joinRoom(userId, input, isGuest) {
  const trimmed = extractRoomToken(input);
  if (!trimmed) {
    throw Object.assign(new Error("Cole o link da sala, o ID ou o nome."), { status: 400 });
  }
  const admin = getSupabaseAdmin();
  const { data: byId } = await admin.from("war_rooms").select("id, guest_access_disabled").eq("id", trimmed).maybeSingle();
  const row = byId ?? (await admin.from("war_rooms").select("id, guest_access_disabled").ilike("name", trimmed).limit(1).maybeSingle()).data;
  if (!row) {
    throw Object.assign(new Error("Sala n\xE3o encontrada. Confira o ID ou o nome."), { status: 404 });
  }
  if (isGuest && row.guest_access_disabled) {
    throw Object.assign(new Error("O acesso de convidados para esta sala foi desativado."), { status: 403 });
  }
  const roomId = row.id;
  if (!isGuest) {
    const { data: membership } = await admin.from("room_members").select("user_id").eq("war_room_id", roomId).eq("user_id", userId).maybeSingle();
    if (membership) return roomId;
    throw Object.assign(
      new Error("Voc\xEA n\xE3o tem acesso a esta sala. Pe\xE7a a um admin para adicionar voc\xEA em Usu\xE1rios."),
      { status: 403 }
    );
  }
  const { error } = await admin.from("room_members").insert({
    war_room_id: roomId,
    user_id: userId,
    added_by: userId
  });
  if (error && error.code !== "23505") {
    throw error;
  }
  return roomId;
}

// api-src/rooms/join.ts
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const authed = await requireUser(req.headers.authorization);
    const body = readJsonBody(req.body);
    const roomId = await joinRoom(
      authed.user.id,
      String(body.input || body.roomId || ""),
      authed.isGuest
    );
    return res.status(200).json({ roomId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao entrar na sala.";
    console.error("rooms/join:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
module.exports = module.exports.default || module.exports;
