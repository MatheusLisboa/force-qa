import type { VercelRequest, VercelResponse } from "@vercel/node";
import { httpErrorStatus, readJsonBody, requireAiUser } from "../shared/auth";
import { detectDuplicate } from "../shared/geminiBugs";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    await requireAiUser(req.headers.authorization);
    const body = readJsonBody(req.body);
    const result = await detectDuplicate(
      String(body.title || ""),
      typeof body.description === "string" ? body.description : undefined,
      Array.isArray(body.existingBugs)
        ? (body.existingBugs as Array<{ id?: string; title?: string; description?: string }>)
        : []
    );
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to detect duplicates";
    console.error("AI detect duplicate error:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
