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

// api-src/admin/create-user.ts
var create_user_exports = {};
__export(create_user_exports, {
  default: () => handler
});
module.exports = __toCommonJS(create_user_exports);

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
var ALLOWED_ROLES = ["admin", "qa", "developer", "dba", "devops", "scrum_master", "viewer"];
async function adminCreateUser(params) {
  const name = params.name.trim();
  const email = params.email.trim().toLowerCase();
  const role = params.role.trim();
  const squad = params.squad.trim();
  if (!name || !email || !params.password || !role || !squad) {
    throw Object.assign(new Error("Todos os campos s\xE3o obrigat\xF3rios."), { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    throw Object.assign(new Error("Papel inv\xE1lido."), { status: 400 });
  }
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: params.password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { name, role, squad }
  });
  if (error) throw error;
  if (!data.user) throw new Error("Falha ao criar usu\xE1rio no Auth.");
  const { error: profileError } = await admin.from("users").upsert({
    id: data.user.id,
    name,
    email,
    role,
    squad,
    is_guest: false
  });
  if (profileError) throw profileError;
  return data.user.id;
}

// api-src/admin/create-user.ts
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await requireAdmin(req.headers.authorization);
    const body = readJsonBody(req.body);
    const userId = await adminCreateUser({
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      role: String(body.role || ""),
      squad: String(body.squad || "")
    });
    return res.status(200).json({ success: true, userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar usu\xE1rio.";
    console.error("admin/create-user:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
module.exports = module.exports.default || module.exports;
