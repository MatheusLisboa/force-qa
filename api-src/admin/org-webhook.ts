import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientErrorMessage, httpErrorStatus, readJsonBody, requireAdmin } from "../shared/auth";
import { wantsExportToken } from "../../src/lib/vercelApiPath";
import { getOrgWebhookUrl, setOrgWebhookUrl } from "../shared/webhooks";
import { getExportTokenMeta, revokeExportToken, rotateExportToken } from "../shared/exportApi";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const exportToken = wantsExportToken(req);
  const allowed = exportToken ? ["GET", "POST", "DELETE"] : ["GET", "POST"];
  if (!allowed.includes(req.method || "")) {
    res.setHeader("Allow", allowed.join(", "));
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actor = await requireAdmin(req.headers.authorization);
    const organizationId = actor.organizationId;

    if (exportToken) {
      if (req.method === "GET") {
        return res.status(200).json(await getExportTokenMeta(organizationId));
      }
      if (req.method === "DELETE") {
        await revokeExportToken(organizationId);
        return res.status(200).json({ ok: true });
      }
      const rotated = await rotateExportToken(organizationId);
      return res.status(200).json(rotated);
    }

    if (req.method === "GET") {
      const url = await getOrgWebhookUrl(organizationId);
      return res.status(200).json({ url: url || "" });
    }

    const body = readJsonBody(req.body);
    const url = body.url === null || body.url === undefined ? "" : String(body.url);
    await setOrgWebhookUrl(organizationId, url);
    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    const message = clientErrorMessage(
      error,
      exportToken ? "Falha ao gerenciar o token de extração." : "Falha ao configurar o webhook."
    );
    console.error(exportToken ? "admin/org-export-token:" : "admin/org-webhook:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
