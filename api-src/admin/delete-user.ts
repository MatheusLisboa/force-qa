import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminDeleteUser } from "../shared/adminUsers";
import { httpErrorStatus, readJsonBody, requireAdmin } from "../shared/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actor = await requireAdmin(req.headers.authorization);
    const body = readJsonBody(req.body);
    await adminDeleteUser(String(body.userId || ""), {
      id: actor.user.id,
      organizationId: actor.organizationId,
      isSuperadmin: actor.isSuperadmin,
    });
    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao remover usuário.";
    console.error("admin/delete-user:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
