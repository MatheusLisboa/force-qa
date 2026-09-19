import { adminCreateUser } from "./adminUsers";
import { resolvePublicSignupRole } from "../../src/lib/inviteRole";
import { normalizeArea } from "../../src/lib/squads";

const SIGNUP_WINDOW_MS = 10 * 60 * 1000;
const SIGNUP_MAX = 6;
const signupHits = new Map<string, number[]>();

function assertSignupRateLimit(email: string): void {
  const key = email || "unknown";
  const now = Date.now();
  const recent = (signupHits.get(key) || []).filter((t) => now - t < SIGNUP_WINDOW_MS);
  if (recent.length >= SIGNUP_MAX) {
    throw Object.assign(new Error("Muitos cadastros neste e-mail. Tente de novo em alguns minutos."), {
      status: 429,
    });
  }
  recent.push(now);
  signupHits.set(key, recent);
}

export async function publicSignUp(params: {
  name: string;
  email: string;
  password: string;
  role: string;
  squad: string;
}): Promise<{ ok: true }> {
  const name = params.name.trim();
  const email = params.email.trim().toLowerCase();
  const password = params.password;
  const squad = normalizeArea(params.squad);
  const role = resolvePublicSignupRole(params.role);

  if (!name || !email || !email.includes("@") || !squad) {
    throw Object.assign(new Error("Informe nome, e-mail, função e área."), { status: 400 });
  }
  if (!password || password.length < 6) {
    throw Object.assign(new Error("A senha deve ter no mínimo 6 caracteres."), { status: 400 });
  }
  assertSignupRateLimit(email);

  await adminCreateUser({
    name,
    email,
    password,
    role,
    squad,
  });
  return { ok: true };
}
