import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, requireUser } from "../_lib/auth";
import { joinRoom } from "../_lib/rooms";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authed = await requireUser(req.headers.authorization);
    const roomId = await joinRoom(
      authed.user.id,
      String(req.body?.input || req.body?.roomId || ""),
      authed.isGuest
    );
    return res.status(200).json({ roomId });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao entrar na sala.";
    console.error("rooms/join:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
