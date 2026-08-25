import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus } from "../_lib/auth";
import { validateGuestRoom } from "../_lib/rooms";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await validateGuestRoom(String(req.body?.input || req.body?.warRoomName || ""));
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Falha ao validar a sala.";
    console.error("validate-room:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
