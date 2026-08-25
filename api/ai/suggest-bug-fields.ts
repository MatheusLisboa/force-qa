import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, requireUser } from "../_lib/auth";
import { suggestBugFields } from "../_lib/geminiBugs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireUser(req.headers.authorization);
    const result = await suggestBugFields(String(req.body?.title || ""), req.body?.description);
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to analyze bug fields";
    console.error("AI suggest fields error:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
