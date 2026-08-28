import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminCreateUser } from "../shared/adminUsers";
import { httpErrorStatus, readJsonBody, requireAdmin } from "../shared/auth";
import { resolveActorOrganizationId } from "../shared/organizations";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actor = await requireAdmin(req.headers.authorization);
    const body = readJsonBody(req.body);
    const organizationId = await resolveActorOrganizationId(
      actor,
      body.organizationId ? String(body.organizationId) : null
    );
    const userId = await adminCreateUser({
      name: String(body.name || ""),
      email: String(body.email || ""),
      password: String(body.password || ""),
      role: String(body.role || ""),
      squad: String(body.squad || ""),
      organizationId,
    });
    return res.status(200).json({ success: true, userId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao criar usuário.";
    console.error("admin/create-user:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
