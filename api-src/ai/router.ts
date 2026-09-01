import type { VercelRequest, VercelResponse } from "@vercel/node";
import { apiPathTail } from "../../src/lib/vercelApiPath";
import detectDuplicate from "./detect-duplicate";
import generateReport from "./generate-report";
import suggestBugFields from "./suggest-bug-fields";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const tail = apiPathTail(req, "ai");
  if (tail === "detect-duplicate") return detectDuplicate(req, res);
  if (tail === "generate-report") return generateReport(req, res);
  if (tail === "suggest-bug-fields") return suggestBugFields(req, res);
  return res.status(404).json({ error: "Not found" });
}
