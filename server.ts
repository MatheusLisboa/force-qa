import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { generateExecutiveReportForRoom } from "./api-src/ai/generate-report";
import { clientErrorMessage, getSupabaseAdmin, httpErrorStatus, requireAiUser, requireCapability, requireSuperadmin } from "./api-src/shared/auth";

import { createOrganizationWithAdmin } from "./api-src/shared/organizations";

import { assertActorCanAccessRoom } from "./api-src/shared/rooms";
import { detectDuplicate, suggestBugFields } from "./api-src/shared/geminiBugs";
import { dispatchRoomWebhook, type WebhookKind } from "./api-src/shared/webhooks";

import { logger } from "./api-src/shared/logger";

import createUserHandler from "./api-src/admin/create-user";
import deleteUserHandler from "./api-src/admin/delete-user";
import moveUserHandler from "./api-src/admin/move-user";
import orgWebhookHandler from "./api-src/admin/org-webhook";
import validateRoomHandler from "./api-src/guest/validate-room";
import joinRoomHandler from "./api-src/rooms/join";
import inviteRoomHandler from "./api-src/rooms/invite";
import exportRoomsHandler from "./api-src/export/rooms";
import exportCardsHandler from "./api-src/export/cards";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = 3000;

function sendError(res: express.Response, error: unknown, fallback: string) {
  const message = clientErrorMessage(error, fallback);
  logger.error(fallback, error);
  res.status(httpErrorStatus(error)).json({ error: message });
}

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

// Rotas que existem na Vercel: o servidor local usa os MESMOS handlers (api-src), então não há duas versões
// da regra de negócio para ficar fora de sincronia.
type Handler = (req: any, res: any) => unknown;
const mount = (method: "get" | "post" | "put" | "delete" | "options", path: string, handler: Handler) =>
  app[method](path, (req, res) => void handler(req, res));

mount("post", "/api/admin/create-user", createUserHandler);
mount("post", "/api/admin/delete-user", deleteUserHandler);
mount("post", "/api/admin/move-user", moveUserHandler);
mount("post", "/api/guest/validate-room", validateRoomHandler);
mount("post", "/api/rooms/join", joinRoomHandler);
mount("post", "/api/rooms/invite", inviteRoomHandler);
for (const method of ["get", "post", "delete"] as const) mount(method, "/api/admin/org-webhook", orgWebhookHandler);
// O token de extração usa o mesmo handler (a Vercel reescreve esta rota para org-webhook?tab=export-token).
for (const method of ["get", "post", "put", "delete"] as const) {
  app[method]("/api/admin/org-export-token", (req, res) => {
    req.query.tab = "export-token";
    return void orgWebhookHandler(req as any, res as any);
  });
}
for (const path of ["/api/export/rooms", "/api/export/cards"]) {
  mount("get", path, path.endsWith("rooms") ? exportRoomsHandler : exportCardsHandler);
  mount("options", path, path.endsWith("rooms") ? exportRoomsHandler : exportCardsHandler);
}

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

app.post("/api/webhooks/dispatch", async (req, res) => {
  try {
    const actor = await requireCapability(req.headers.authorization, "write_cards");
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
