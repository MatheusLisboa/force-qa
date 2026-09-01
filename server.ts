import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { generateExecutiveReportForRoom } from "./api-src/ai/generate-report";
import { clientErrorMessage, getSupabaseAdmin, httpErrorStatus, requireAdmin, requireAiUser, requireSuperadmin, requireUser } from "./api-src/shared/auth";
import { adminCreateUser, adminDeleteUser, adminMoveUser } from "./api-src/shared/adminUsers";
import { createOrganizationWithAdmin, resolveActorOrganizationId } from "./api-src/shared/organizations";
import { appRedirectTo } from "./api-src/shared/appUrl";
import { assertActorCanAccessRoom, inviteToRoom, joinRoom, validateGuestRoom } from "./api-src/shared/rooms";
import { detectDuplicate, suggestBugFields } from "./api-src/shared/geminiBugs";
import { dispatchRoomWebhook, getOrgWebhookUrl, setOrgWebhookUrl, type WebhookKind } from "./api-src/shared/webhooks";
import {
  applyExportCors,
  getExportTokenMeta,
  listExportCards,
  listExportRooms,
  requireExportOrganization,
  revokeExportToken,
  rotateExportToken,
} from "./api-src/shared/exportApi";
import { canWriteBugs } from "./src/lib/permissions";
import { wantsExportToken } from "./src/lib/vercelApiPath";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = 3000;

function sendError(res: express.Response, error: unknown, fallback: string) {
  const message = clientErrorMessage(error, fallback);
  console.error(fallback, error);
  res.status(httpErrorStatus(error)).json({ error: message });
}

async function handleOrgIntegrations(req: express.Request, res: express.Response) {
  try {
    const actor = await requireAdmin(req.headers.authorization);
    const exportToken = wantsExportToken(req);
    if (exportToken) {
      if (req.method === "GET") {
        res.json(await getExportTokenMeta(actor.organizationId));
        return;
      }
      if (req.method === "DELETE") {
        await revokeExportToken(actor.organizationId);
        res.json({ ok: true });
        return;
      }
      if (req.method === "POST") {
        res.json(await rotateExportToken(actor.organizationId));
        return;
      }
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    if (req.method === "GET") {
      const url = await getOrgWebhookUrl(actor.organizationId);
      res.json({ url: url || "" });
      return;
    }
    if (req.method === "POST") {
      const url = req.body?.url === null || req.body?.url === undefined ? "" : String(req.body.url);
      await setOrgWebhookUrl(actor.organizationId, url);
      res.json({ ok: true });
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    sendError(res, error, "Falha ao configurar a integração.");
  }
}

app.post("/api/admin/create-user", async (req, res) => {
  try {
    const actor = await requireAdmin(req.headers.authorization);
    const { name, email, password, role, squad, organizationId: requestedOrgId } = req.body;
    const organizationId = await resolveActorOrganizationId(actor, requestedOrgId);
    const userId = await adminCreateUser({
      name,
      email,
      password,
      role,
      squad,
      organizationId,
    });
    res.json({ success: true, userId });
  } catch (error) {
    sendError(res, error, "Falha ao criar usuário.");
  }
});

app.post("/api/admin/create-organization", async (req, res) => {
  try {
    await requireSuperadmin(req.headers.authorization);
    const result = await createOrganizationWithAdmin({
      name: String(req.body?.name || ""),
      slug: String(req.body?.slug || ""),
      adminName: String(req.body?.adminName || ""),
      adminEmail: String(req.body?.adminEmail || ""),
      adminPassword: String(req.body?.adminPassword || ""),
    });
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, "Falha ao criar organização.");
  }
});

app.post("/api/admin/delete-user", async (req, res) => {
  try {
    const actor = await requireAdmin(req.headers.authorization);
    await adminDeleteUser(String(req.body?.userId || ""), {
      id: actor.user.id,
      organizationId: actor.organizationId,
      isSuperadmin: actor.isSuperadmin,
    });
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Falha ao remover usuário.");
  }
});

app.post("/api/admin/move-user", async (req, res) => {
  try {
    const actor = await requireSuperadmin(req.headers.authorization);
    await adminMoveUser({
      isSuperadmin: actor.isSuperadmin,
      userId: String(req.body?.userId || ""),
      organizationId: String(req.body?.organizationId || ""),
    });
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Falha ao mover o usuário.");
  }
});

app.post("/api/guest/validate-room", async (req, res) => {
  try {
    const result = await validateGuestRoom(String(req.body?.input || req.body?.warRoomName || ""));
    res.json(result);
  } catch (error) {
    sendError(res, error, "Falha ao validar a sala.");
  }
});

app.post("/api/rooms/join", async (req, res) => {
  try {
    const authed = await requireUser(req.headers.authorization);
    const roomId = await joinRoom(
      authed.user.id,
      String(req.body?.input || req.body?.roomId || ""),
      authed.isGuest,
      { organizationId: authed.organizationId, isSuperadmin: authed.isSuperadmin }
    );
    res.json({ roomId });
  } catch (error) {
    sendError(res, error, "Falha ao entrar na sala.");
  }
});

app.post("/api/rooms/invite", async (req, res) => {
  try {
    const authed = await requireUser(req.headers.authorization);
    const result = await inviteToRoom({
      actorId: authed.user.id,
      actorRole: authed.role,
      actorOrganizationId: authed.organizationId,
      isSuperadmin: authed.isSuperadmin,
      roomId: String(req.body?.roomId || ""),
      email: String(req.body?.email || ""),
      role: String(req.body?.role || ""),
      redirectTo: appRedirectTo(),
    });
    res.json(result);
  } catch (error) {
    sendError(res, error, "Falha ao enviar convite.");
  }
});

app.post("/api/ai/suggest-bug-fields", async (req, res) => {
  try {
    await requireAiUser(req.headers.authorization);
    const result = await suggestBugFields(String(req.body?.title || ""), req.body?.description);
    res.json(result);
  } catch (error) {
    sendError(res, error, "Failed to analyze bug fields");
  }
});

app.post("/api/ai/detect-duplicate", async (req, res) => {
  try {
    await requireAiUser(req.headers.authorization);
    const result = await detectDuplicate(
      String(req.body?.title || ""),
      req.body?.description,
      Array.isArray(req.body?.existingBugs) ? req.body.existingBugs : []
    );
    res.json(result);
  } catch (error) {
    sendError(res, error, "Failed to detect duplicates");
  }
});

app.get("/api/admin/org-webhook", handleOrgIntegrations);
app.post("/api/admin/org-webhook", handleOrgIntegrations);
app.delete("/api/admin/org-webhook", handleOrgIntegrations);
app.get("/api/admin/org-export-token", (req, res) => {
  req.query.tab = "export-token";
  return handleOrgIntegrations(req, res);
});
app.post("/api/admin/org-export-token", (req, res) => {
  req.query.tab = "export-token";
  return handleOrgIntegrations(req, res);
});
app.delete("/api/admin/org-export-token", (req, res) => {
  req.query.tab = "export-token";
  return handleOrgIntegrations(req, res);
});

app.get("/api/export/rooms", async (req, res) => {
  applyExportCors(res);
  try {
    const { organizationId } = await requireExportOrganization(req.headers);
    res.json(await listExportRooms(organizationId));
  } catch (error) {
    sendError(res, error, "Falha ao listar salas.");
  }
});

app.get("/api/export/cards", async (req, res) => {
  applyExportCors(res);
  try {
    const { organizationId } = await requireExportOrganization(req.headers);
    res.json(await listExportCards(organizationId, req.query));
  } catch (error) {
    sendError(res, error, "Falha ao listar cards.");
  }
});

app.options("/api/export/rooms", (_req, res) => {
  applyExportCors(res);
  res.status(204).end();
});

app.options("/api/export/cards", (_req, res) => {
  applyExportCors(res);
  res.status(204).end();
});

app.post("/api/webhooks/dispatch", async (req, res) => {
  try {
    const actor = await requireUser(req.headers.authorization);
    if (!canWriteBugs(actor.role) || actor.isGuest) {
      throw Object.assign(new Error("Sem permissão para disparar webhook."), { status: 403 });
    }
    const roomId = String(req.body?.roomId || "").trim();
    const bugId = String(req.body?.bugId || "").trim();
    const kind: WebhookKind | "" =
      req.body?.kind === "ready_for_qa" ? "ready_for_qa" : req.body?.kind === "blocker" ? "blocker" : "";
    if (!roomId || !bugId || !kind) {
      throw Object.assign(new Error("roomId, bugId e kind são obrigatórios."), { status: 400 });
    }
    await assertActorCanAccessRoom(
      {
        id: actor.user.id,
        role: actor.role,
        organizationId: actor.organizationId,
        isSuperadmin: actor.isSuperadmin,
        isGuest: actor.isGuest,
      },
      roomId
    );
    const admin = getSupabaseAdmin();
    const [{ data: room }, { data: bug }] = await Promise.all([
      admin.from("war_rooms").select("id, name, organization_id").eq("id", roomId).maybeSingle(),
      admin.from("bugs").select("id, title, war_room_id").eq("id", bugId).maybeSingle(),
    ]);
    if (!room || !bug || bug.war_room_id !== roomId) {
      throw Object.assign(new Error("Card ou sala não encontrados."), { status: 404 });
    }
    await dispatchRoomWebhook({
      organizationId: String(room.organization_id || actor.organizationId),
      kind,
      roomId,
      roomName: String(room.name || roomId),
      bugId,
      title: String(bug.title || "Card"),
    });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "Falha ao disparar webhook.");
  }
});

app.post("/api/ai/generate-report", async (req, res) => {
  try {
    const authed = await requireAiUser(req.headers.authorization);
    const roomId = String(req.body?.roomId || "").trim();
    await assertActorCanAccessRoom(
      {
        id: authed.user.id,
        role: authed.role,
        organizationId: authed.organizationId,
        isSuperadmin: authed.isSuperadmin,
        isGuest: authed.isGuest,
      },
      roomId
    );
    const result = await generateExecutiveReportForRoom(roomId);
    res.json(result);
  } catch (error) {
    sendError(res, error, "Falha ao gerar relatório executivo.");
  }
});

async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[War Room Server] fully running on HTTP port ${PORT} in ${process.env.NODE_ENV || "development"} mode.`);
  });
}

initServer();
