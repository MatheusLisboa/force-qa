import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, readJsonBody, requireAiUser } from "../shared/auth";
import { suggestBugFields } from "../shared/geminiBugs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAiUser(req.headers.authorization);
    const body = readJsonBody(req.body);
    const result = await suggestBugFields(
      String(body.title || ""),
      typeof body.description === "string" ? body.description : undefined
    );
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to analyze bug fields";
    console.error("AI suggest fields error:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
