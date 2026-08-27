import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { generateExecutiveReport } from "./api-src/ai/generate-report";
import { httpErrorStatus, requireAdmin, requireUser } from "./api-src/shared/auth";
import { adminCreateUser, adminDeleteUser } from "./api-src/shared/adminUsers";
import { inviteToRoom, joinRoom, validateGuestRoom } from "./api-src/shared/rooms";
import { detectDuplicate, suggestBugFields } from "./api-src/shared/geminiBugs";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));

const PORT = 3000;

function sendError(res: express.Response, error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  console.error(fallback, error);
  res.status(httpErrorStatus(error)).json({ error: message });
}

app.post("/api/admin/create-user", async (req, res) => {
  try {
    await requireAdmin(req.headers.authorization);
    const { name, email, password, role, squad } = req.body;
    const userId = await adminCreateUser({ name, email, password, role, squad });
    res.json({ success: true, userId });
  } catch (error) {
    sendError(res, error, "Falha ao criar usuário.");
  }
});

app.post("/api/admin/delete-user", async (req, res) => {
  try {
    await requireAdmin(req.headers.authorization);
    await adminDeleteUser(String(req.body?.userId || ""));
    res.json({ success: true });
  } catch (error) {
    sendError(res, error, "Falha ao remover usuário.");
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
      authed.isGuest
    );
    res.json({ roomId });
  } catch (error) {
    sendError(res, error, "Falha ao entrar na sala.");
  }
});

app.post("/api/rooms/invite", async (req, res) => {
  try {
    const authed = await requireUser(req.headers.authorization);
    const origin = String(req.headers.origin || process.env.APP_URL || `http://localhost:${PORT}`);
    const result = await inviteToRoom({
      actorId: authed.user.id,
      actorRole: authed.role,
      roomId: String(req.body?.roomId || ""),
      email: String(req.body?.email || ""),
      redirectTo: `${origin.replace(/\/$/, "")}/`,
    });
    res.json(result);
  } catch (error) {
    sendError(res, error, "Falha ao enviar convite.");
  }
});

app.post("/api/ai/suggest-bug-fields", async (req, res) => {
  try {
    await requireUser(req.headers.authorization);
    const result = await suggestBugFields(String(req.body?.title || ""), req.body?.description);
    res.json(result);
  } catch (error) {
    sendError(res, error, "Failed to analyze bug fields");
  }
});

app.post("/api/ai/detect-duplicate", async (req, res) => {
  try {
    await requireUser(req.headers.authorization);
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

app.post("/api/ai/generate-report", async (req, res) => {
  try {
    await requireUser(req.headers.authorization);
    const result = await generateExecutiveReport(req.body?.metrics);
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
