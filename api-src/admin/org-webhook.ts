import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientErrorMessage, httpErrorStatus, readJsonBody, requireAdmin, requireIntegrationsManager } from "../shared/auth";
import { wantsExportToken } from "../../src/lib/vercelApiPath";
import { normalizeExportScope } from "../../src/lib/exportScope";
import { getOrgWebhookUrl, setOrgWebhookUrl } from "../shared/webhooks";
import { getExportTokenMeta, revokeExportToken, rotateExportToken, setExportScope } from "../shared/exportTokenStore";
import { logAudit } from "../shared/audit";
import { logger } from "../shared/logger";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const exportToken = wantsExportToken(req);
  const allowed = exportToken ? ["GET", "POST", "PUT", "DELETE"] : ["GET", "POST"];
  if (!allowed.includes(req.method || "")) {
    res.setHeader("Allow", allowed.join(", "));
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // O token de extração lê todos os cards da organização fora do login e das salas: só admin gera, troca ou revoga.
    // O webhook continua com quem tem a capacidade "integrações".
    const actor = exportToken
      ? await requireAdmin(req.headers.authorization)
      : await requireIntegrationsManager(req.headers.authorization);
    const organizationId = actor.organizationId;
    const who = { organizationId, actorId: actor.user.id, actorName: actor.name };

    if (exportToken) {
      if (req.method === "GET") {
        return res.status(200).json(await getExportTokenMeta(organizationId));
      }
      if (req.method === "DELETE") {
        await revokeExportToken(organizationId);
        await logAudit({ ...who, action: "integration.export_token_revoked", targetType: "organization", targetId: organizationId });
        return res.status(200).json({ ok: true });
      }
      const body = readJsonBody(req.body);
      const scope = normalizeExportScope(body.roomIds);
      if (req.method === "PUT") {
        await setExportScope(organizationId, scope);
        await logAudit({ ...who, action: "integration.export_scope_changed", targetType: "organization", targetId: organizationId, detail: { rooms: scope === null ? "all" : scope.length } });
        return res.status(200).json({ ok: true, roomIds: scope });
      }
      const rotated = await rotateExportToken(organizationId, scope);
      await logAudit({ ...who, action: "integration.export_token_rotated", targetType: "organization", targetId: organizationId, detail: { rooms: scope === null ? "all" : scope.length } });
      return res.status(200).json(rotated);
    }

    if (req.method === "GET") {
      const url = await getOrgWebhookUrl(organizationId);
      return res.status(200).json({ url: url || "" });
    }

    const body = readJsonBody(req.body);
    const url = body.url === null || body.url === undefined ? "" : String(body.url);
    await setOrgWebhookUrl(organizationId, url);
    // A URL do webhook pode carregar segredo: registra só que mudou.
    await logAudit({ ...who, action: "integration.webhook_changed", targetType: "organization", targetId: organizationId, detail: { configured: Boolean(url) } });
    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    const message = clientErrorMessage(
      error,
      exportToken ? "Falha ao gerenciar o token de extração." : "Falha ao configurar o webhook."
    );
    logger.error(exportToken ? "admin/org-export-token:" : "admin/org-webhook:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
