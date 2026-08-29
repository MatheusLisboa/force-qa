import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientErrorMessage, httpErrorStatus, readJsonBody, requireUser, getSupabaseAdmin } from "../shared/auth";
import { assertActorCanAccessRoom } from "../shared/rooms";
import { dispatchRoomWebhook, type WebhookKind } from "../shared/webhooks";
import { canWriteBugs } from "../../src/lib/permissions";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const actor = await requireUser(req.headers.authorization);
    if (!canWriteBugs(actor.role) || actor.isGuest) {
      throw Object.assign(new Error("Sem permissão para disparar webhook."), { status: 403 });
    }
    const body = readJsonBody(req.body);
    const roomId = String(body.roomId || "").trim();
    const bugId = String(body.bugId || "").trim();
    const kind = body.kind === "ready_for_qa" ? "ready_for_qa" : body.kind === "blocker" ? "blocker" : "";
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
      kind: kind as WebhookKind,
      roomId,
      roomName: String(room.name || roomId),
      bugId,
      title: String(bug.title || "Card"),
    });
    return res.status(200).json({ ok: true });
  } catch (error: unknown) {
    const message = clientErrorMessage(error, "Falha ao disparar webhook.");
    console.error("webhooks/dispatch:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
