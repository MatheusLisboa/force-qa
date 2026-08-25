import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, requireUser } from "../_lib/auth";
import { detectDuplicate } from "../_lib/geminiBugs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireUser(req.headers.authorization);
    const result = await detectDuplicate(
      String(req.body?.title || ""),
      req.body?.description,
      Array.isArray(req.body?.existingBugs) ? req.body.existingBugs : []
    );
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to detect duplicates";
    console.error("AI detect duplicate error:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
