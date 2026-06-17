import type { VercelRequest, VercelResponse } from "@vercel/node";

// ---------------------------------------------------------------------------
// AI Report — single file for Vercel ESM (no cross-module imports)
// ---------------------------------------------------------------------------

interface AIProvider {
  readonly name: string;
  readonly model: string;
  generateReport(systemPrompt: string, userPrompt: string): Promise<string>;
}

function envVar(key: string): string | undefined {
  const raw = process.env[key];
  if (!raw) return undefined;
  return raw.trim().replace(/^["']|["']$/g, "");
}

const REPORT_SYSTEM_PROMPT = `Você é um QA Manager e Engineering Manager experiente.
Sua tarefa é produzir um relatório executivo de QA em Markdown para gestores.

Regras obrigatórias:
- Use APENAS os dados numéricos e fatos fornecidos no contexto JSON.
- NÃO invente métricas, bugs, squads, tendências ou números ausentes.
- Se um dado não existir ou for zero, declare explicitamente a limitação.
- Linguagem executiva, objetiva e acionável em português do Brasil.
- Identifique gargalos, riscos e áreas problemáticas com base nos números.
- Não inclua blocos de código JSON na resposta final.
- Retorne somente Markdown válido.`;

function buildReportUserPrompt(metricsJson: string): string {
  return `Com base EXCLUSIVAMENTE no contexto agregado abaixo, gere um relatório executivo de QA.

Use exatamente esta estrutura de seções:

# Resumo Executivo

## Situação Atual

## Principais Problemas

## Gargalos Identificados

## Tendências

## Recomendações

## Próximas Ações

Contexto agregado (JSON):
${metricsJson}`;
}

class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter";
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateReport(systemPrompt: string, userPrompt: string): Promise<string> {
    const vercelUrl = envVar("VERCEL_URL");
    const appUrl =
      envVar("APP_URL") || (vercelUrl ? `https://${vercelUrl}` : "https://force-qa.vercel.app");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": appUrl,
        "X-Title": "ForceQA AI Report",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        max_tokens: 2200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenRouter error (${response.status}): ${errText || response.statusText}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenRouter retornou resposta vazia.");
    return content;
  }
}

class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;

  constructor(model: string, baseUrl: string) {
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async generateReport(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Ollama error (${response.status}): ${errText || response.statusText}`);
    }

    const data = (await response.json()) as { message?: { content?: string } };
    const content = data.message?.content?.trim();
    if (!content) throw new Error("Ollama retornou resposta vazia.");
    return content;
  }
}

function createAIProvider(): AIProvider {
  const configured = (envVar("AI_PROVIDER") || "").toLowerCase();

  if (configured === "ollama" || (!configured && envVar("OLLAMA_BASE_URL"))) {
    return new OllamaProvider(
      envVar("OLLAMA_MODEL") || "llama3.2",
      envVar("OLLAMA_BASE_URL") || "http://localhost:11434"
    );
  }

  const apiKey = envVar("OPENROUTER_API_KEY");
  if (configured === "openrouter" || apiKey) {
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY é obrigatória quando AI_PROVIDER=openrouter.");
    }
    return new OpenRouterProvider(apiKey, envVar("OPENROUTER_MODEL") || "google/gemini-2.5-flash");
  }

  throw new Error(
    "Nenhum provider de IA configurado. Defina AI_PROVIDER=openrouter e OPENROUTER_API_KEY."
  );
}

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

// ---------------------------------------------------------------------------
// Vercel serverless handler
// ---------------------------------------------------------------------------

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
