import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, requireUser } from "../_lib/auth";
import { inviteToRoom } from "../_lib/rooms";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authed = await requireUser(req.headers.authorization);
    const origin = String(req.headers.origin || process.env.APP_URL || "https://force-qa.vercel.app");
    const result = await inviteToRoom({
      actorId: authed.user.id,
      actorRole: authed.role,
      roomId: String(req.body?.roomId || ""),
      email: String(req.body?.email || ""),
      redirectTo: `${origin.replace(/\/$/, "")}/`,
    });
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao enviar convite.";
    console.error("rooms/invite:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
