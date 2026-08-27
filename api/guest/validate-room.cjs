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

// api-src/guest/validate-room.ts
var validate_room_exports = {};
__export(validate_room_exports, {
  default: () => handler
});
module.exports = __toCommonJS(validate_room_exports);

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
async function validateGuestRoom(input) {
  const trimmed = extractRoomToken(input);
  if (!trimmed) {
    throw Object.assign(new Error("Cole o link da sala, o ID ou o nome."), { status: 400 });
  }
  const admin = getSupabaseAdmin();
  const { data: byId } = await admin.from("war_rooms").select("id, name, guest_access_disabled").eq("id", trimmed).maybeSingle();
  const row = byId ?? (await admin.from("war_rooms").select("id, name, guest_access_disabled").ilike("name", trimmed).limit(1).maybeSingle()).data;
  if (!row) {
    throw Object.assign(new Error("A sala informada n\xE3o existe. Verifique o ID ou o nome."), { status: 404 });
  }
  if (row.guest_access_disabled) {
    throw Object.assign(new Error("O acesso de convidados para esta sala foi desativado."), { status: 403 });
  }
  return { id: row.id, name: row.name };
}

// api-src/guest/validate-room.ts
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const body = readJsonBody(req.body);
    const result = await validateGuestRoom(String(body.input || body.warRoomName || ""));
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao validar a sala.";
    console.error("validate-room:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
module.exports = module.exports.default || module.exports;
