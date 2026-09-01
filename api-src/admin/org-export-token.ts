import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientErrorMessage, httpErrorStatus, requireAdmin } from "../shared/auth";
import { getExportTokenMeta, revokeExportToken, rotateExportToken } from "../shared/exportApi";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actor = await requireAdmin(req.headers.authorization);

    if (req.method === "GET") {
      return res.status(200).json(await getExportTokenMeta(actor.organizationId));
    }
    if (req.method === "DELETE") {
      await revokeExportToken(actor.organizationId);
      return res.status(200).json({ ok: true });
    }

    const rotated = await rotateExportToken(actor.organizationId);
    return res.status(200).json(rotated);
  } catch (error: unknown) {
    const message = clientErrorMessage(error, "Falha ao gerenciar o token de extração.");
    console.error("admin/org-export-token:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
