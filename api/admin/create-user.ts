import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, requireAdmin } from "../_lib/auth";
import { adminCreateUser } from "../_lib/adminUsers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdmin(req.headers.authorization);
    const { name, email, password, role, squad } = req.body || {};
    const userId = await adminCreateUser({ name, email, password, role, squad });
    return res.status(200).json({ success: true, userId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao criar usuário.";
    console.error("admin/create-user:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
