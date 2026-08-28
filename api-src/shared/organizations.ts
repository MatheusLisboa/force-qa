import { isOrganizationId, isValidOrganizationSlug, slugifyOrganizationName } from "../../src/lib/organizations";
import { adminCreateUser } from "./adminUsers";
import { getSupabaseAdmin, wrapThrownError } from "./auth";

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  return String((error as { code?: unknown }).code || "");
}

function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "");
  return String((error as { message?: unknown }).message || "");
}

function isUniqueSlugError(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  return code === "23505" && (message.includes("slug") || message.includes("organizations"));
}

export async function createOrganizationWithAdmin(params: {
  name: string;
  slug?: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
}): Promise<{ organizationId: string; adminUserId: string; slug: string }> {
  const name = params.name.trim();
  const slug = slugifyOrganizationName(params.slug?.trim() || name);
  const adminName = params.adminName.trim();
  const adminEmail = params.adminEmail.trim().toLowerCase();

  if (!name || !adminName || !adminEmail || !params.adminPassword) {
    throw Object.assign(new Error("Preencha nome da empresa e os dados do primeiro admin."), { status: 400 });
  }
  if (!isValidOrganizationSlug(slug)) {
    throw Object.assign(new Error("Slug inválido. Use letras minúsculas, números e hífen."), { status: 400 });
  }
  if (params.adminPassword.length < 6) {
    throw Object.assign(new Error("A senha do admin deve ter no mínimo 6 caracteres."), { status: 400 });
  }

  const organizationId = crypto.randomUUID();
  const admin = getSupabaseAdmin();

  const { error: insertError } = await admin.from("organizations").insert({
    id: organizationId,
    name,
    slug,
  });
  if (insertError) {
    if (isUniqueSlugError(insertError)) {
      throw Object.assign(new Error("Já existe uma organização com esse slug."), { status: 409 });
    }
    throw wrapThrownError(insertError, "Falha ao criar a organização.");
  }

  try {
    const adminUserId = await adminCreateUser({
      name: adminName,
      email: adminEmail,
      password: params.adminPassword,
      role: "admin",
      squad: "Admin",
      organizationId,
    });
    return { organizationId, adminUserId, slug };
  } catch (error) {
    console.error("createOrganizationWithAdmin:", {
      code: errorCode(error),
      message: errorMessage(error),
    });
    await admin.from("organizations").delete().eq("id", organizationId);
    throw wrapThrownError(error, "Falha ao criar o admin da organização.");
  }
}

export async function resolveActorOrganizationId(
  actor: { organizationId: string; isSuperadmin: boolean },
  requestedId?: string | null
): Promise<string> {
  const requested = (requestedId || "").trim();
  if (!requested || !actor.isSuperadmin) {
    return actor.organizationId;
  }
  if (!isOrganizationId(requested)) {
    throw Object.assign(new Error("Organização inválida."), { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("id", requested)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Organização não encontrada."), { status: 404 });
  }
  return requested;
}
