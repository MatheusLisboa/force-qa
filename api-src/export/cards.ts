import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientErrorMessage, httpErrorStatus } from "../shared/auth";
import { applyExportCors, listExportCards, requireExportOrganization } from "../shared/exportApi";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyExportCors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { organizationId } = await requireExportOrganization(req.headers);
    const payload = await listExportCards(organizationId, req.query);
    return res.status(200).json(payload);
  } catch (error: unknown) {
    const message = clientErrorMessage(error, "Falha ao listar cards.");
    console.error("export/cards:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
