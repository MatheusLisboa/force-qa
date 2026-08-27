import type { VercelRequest, VercelResponse } from "@vercel/node";
import { adminCreateUser } from "../shared/adminUsers";
import { httpErrorStatus, readJsonBody, requireAdmin } from "../shared/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
      squad: String(body.squad || ""),
    });
    return res.status(200).json({ success: true, userId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao criar usuário.";
    console.error("admin/create-user:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
