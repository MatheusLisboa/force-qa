import type { VercelRequest, VercelResponse } from "@vercel/node";
import { clientErrorMessage, httpErrorStatus, readJsonBody } from "../shared/auth";
import { joinAsGuest, validateGuestRoom } from "../shared/rooms";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = readJsonBody(req.body);
    const input = String(body.input || body.warRoomName || "");
    if (body.join === true || body.join === "true") {
      const result = await joinAsGuest({
        input,
        name: String(body.name || ""),
        squad: String(body.squad || ""),
      });
      return res.status(200).json(result);
    }
    const result = await validateGuestRoom(input);
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = clientErrorMessage(error, "Falha ao validar a sala.");
    const readable = !message || message === "{}" ? "Não foi possível concluir. Tente de novo." : message;
    console.error("validate-room:", error);
    return res.status(httpErrorStatus(error)).json({ error: readable });
  }
}
