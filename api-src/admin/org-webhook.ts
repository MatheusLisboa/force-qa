import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientErrorMessage, httpErrorStatus, readJsonBody, requireAdmin } from "../shared/auth";
import { getOrgWebhookUrl, setOrgWebhookUrl } from "../shared/webhooks";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actor = await requireAdmin(req.headers.authorization);
    const organizationId = actor.organizationId;

    if (req.method === "GET") {
      const url = await getOrgWebhookUrl(organizationId);
      return res.status(200).json({ url: url || "" });
    }

    const body = readJsonBody(req.body);
    const url = body.url === null || body.url === undefined ? "" : String(body.url);
    await setOrgWebhookUrl(organizationId, url);
    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    const message = clientErrorMessage(error, "Falha ao configurar o webhook.");
    console.error("admin/org-webhook:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
