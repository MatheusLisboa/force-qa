import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, readJsonBody, requireUser } from "../shared/auth";
import { joinRoomDetailed } from "../shared/rooms";
import { logAudit } from "../shared/audit";
import { logger } from "../shared/logger";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authed = await requireUser(req.headers.authorization);
    const body = readJsonBody(req.body);
    const joined = await joinRoomDetailed(
      authed.user.id,
      String(body.input || body.roomId || ""),
      authed.isGuest,
      { organizationId: authed.organizationId, isSuperadmin: authed.isSuperadmin, isOrgAdmin: authed.role === "admin" }
    );
    if (joined.created) {
      await logAudit({
        organizationId: joined.organizationId ?? authed.organizationId ?? null,
        actorId: authed.user.id,
        actorName: authed.name,
        action: "room.member_joined",
        targetType: "room",
        targetId: joined.roomId,
        detail: { by: authed.isGuest ? "guest_link" : "link_or_id" },
      });
    }
    return res.status(200).json({ roomId: joined.roomId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao entrar na sala.";
    logger.error("rooms/join:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
