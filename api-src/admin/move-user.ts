import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminMoveUser } from "../shared/adminUsers";
import { clientErrorMessage, httpErrorStatus, readJsonBody, requireSuperadmin } from "../shared/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actor = await requireSuperadmin(req.headers.authorization);
    const body = readJsonBody(req.body);
    await adminMoveUser({
      isSuperadmin: actor.isSuperadmin,
      userId: String(body.userId || ""),
      organizationId: String(body.organizationId || ""),
    });
    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = clientErrorMessage(error, "Falha ao mover o usuário.");
    console.error("admin/move-user:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
