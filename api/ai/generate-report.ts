import type { VercelRequest, VercelResponse } from "@vercel/node";
import { generateExecutiveReport } from "../../server/ai/generateReport";

export const config = {
  maxDuration: 60,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await generateExecutiveReport(req.body?.metrics);
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Falha ao gerar relatório executivo.";
    console.error("AI generate report error:", error);
    return res.status(500).json({ error: message });
  }
}
