import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, requireAdmin } from "../_lib/auth";
import { adminDeleteUser } from "../_lib/adminUsers";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAdmin(req.headers.authorization);
    await adminDeleteUser(String(req.body?.userId || ""));
    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao remover usuário.";
    console.error("admin/delete-user:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
