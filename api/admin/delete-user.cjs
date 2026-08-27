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

// api-src/admin/delete-user.ts
var delete_user_exports = {};
__export(delete_user_exports, {
  default: () => handler
});
module.exports = __toCommonJS(delete_user_exports);

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
async function requireAdmin(authHeader) {
  const authed = await requireUser(authHeader);
  if (authed.role !== "admin") {
    throw Object.assign(new Error("Apenas administradores podem executar esta opera\xE7\xE3o."), { status: 403 });
  }
  return authed;
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

// api-src/shared/adminUsers.ts
async function adminDeleteUser(userId) {
  if (!userId) {
    throw Object.assign(new Error("ID do usu\xE1rio \xE9 obrigat\xF3rio."), { status: 400 });
  }
  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

// api-src/admin/delete-user.ts
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await requireAdmin(req.headers.authorization);
    const body = readJsonBody(req.body);
    await adminDeleteUser(String(body.userId || ""));
    return res.status(200).json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao remover usu\xE1rio.";
    console.error("admin/delete-user:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
module.exports = module.exports.default || module.exports;
