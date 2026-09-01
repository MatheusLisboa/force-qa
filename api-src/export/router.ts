import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiPathTail } from "../../src/lib/vercelApiPath";
import listCards from "./cards";
import listRooms from "./rooms";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const tail = apiPathTail(req, "export");
  if (tail === "rooms") return listRooms(req, res);
  if (tail === "cards") return listCards(req, res);
  return res.status(404).json({ error: "Not found" });
}
