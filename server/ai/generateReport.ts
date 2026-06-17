import { createAIProvider } from "./providerFactory";
import { REPORT_SYSTEM_PROMPT, buildReportUserPrompt } from "./reportPrompt";

export interface GenerateReportResult {
  markdown: string;
  generatedAt: string;
  provider: string;
  model: string;
}

export async function generateExecutiveReport(
  metrics: unknown
): Promise<GenerateReportResult> {
  if (!metrics || typeof metrics !== "object") {
    throw new Error("Métricas agregadas são obrigatórias.");
  }

  const provider = createAIProvider();
  const metricsJson = JSON.stringify(metrics, null, 2);
  const userPrompt = buildReportUserPrompt(metricsJson);
  const markdown = await provider.generateReport(REPORT_SYSTEM_PROMPT, userPrompt);

  return {
    markdown,
    generatedAt: new Date().toISOString(),
    provider: provider.name,
    model: provider.model,
  };
}
