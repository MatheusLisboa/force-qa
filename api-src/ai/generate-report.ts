import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getSupabaseAdmin, httpErrorStatus, readJsonBody, requireAiUser } from "../shared/auth";
import { assertActorCanAccessRoom } from "../shared/rooms";
import { aggregateBoardMetrics } from "../../src/lib/aiReport/aggregateMetrics";
import type { Bug, WarRoom } from "../../src/types";

// ---------------------------------------------------------------------------
// AI Report
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
    throw Object.assign(new Error("Métricas agregadas são obrigatórias."), { status: 400 });
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

function rowToWarRoom(row: Record<string, unknown>): WarRoom {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    project: String(row.project || ""),
    squad: String(row.squad || ""),
    date: String(row.date || ""),
    periodEnd: (row.period_end as string) || "",
    description: String(row.description || ""),
    severity: (row.severity as WarRoom["severity"]) || "medium",
    status: (row.status as WarRoom["status"]) || "active",
    roomType: (row.room_type as WarRoom["roomType"]) || "war_room",
    createdAt: String(row.created_at || ""),
    createdBy: String(row.created_by || ""),
    createdByName: (row.created_by_name as string) || undefined,
    organizationId: (row.organization_id as string) || undefined,
  };
}

function rowToBug(row: Record<string, unknown>): Bug {
  return {
    id: String(row.id),
    warRoomId: String(row.war_room_id),
    title: String(row.title || ""),
    description: String(row.description || ""),
    criticism: row.criticism as Bug["criticism"],
    status: row.status as Bug["status"],
    kanbanColumnId: (row.kanban_column_id as string) || undefined,
    ownerId: (row.owner_id as string) || null,
    ownerName: (row.owner_name as string) || null,
    environment: (row.environment as Bug["environment"]) || "homologation",
    tags: (row.tags as string[]) || [],
    priority: (row.priority as Bug["priority"]) || "medium",
    type: (row.type as Bug["type"]) || "bug",
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    createdBy: String(row.created_by || ""),
    createdByName: String(row.created_by_name || ""),
    resolvedAt: (row.resolved_at as string) || undefined,
    reopenCount: (row.reopen_count as number) || 0,
    archived: Boolean(row.archived),
  };
}

export async function generateExecutiveReportForRoom(roomId: string): Promise<GenerateReportResult> {
  const admin = getSupabaseAdmin();
  const { data: roomRow, error: roomError } = await admin
    .from("war_rooms")
    .select("*")
    .eq("id", roomId)
    .maybeSingle();
  if (roomError) throw roomError;
  if (!roomRow) {
    throw Object.assign(new Error("Sala não encontrada."), { status: 404 });
  }

  const { data: bugRows, error: bugError } = await admin
    .from("bugs")
    .select("*")
    .eq("war_room_id", roomId)
    .eq("archived", false);
  if (bugError) throw bugError;

  const metrics = aggregateBoardMetrics(rowToWarRoom(roomRow), (bugRows || []).map(rowToBug));
  return generateExecutiveReport(metrics);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const authed = await requireAiUser(req.headers.authorization);
    const body = readJsonBody(req.body);
    const roomId = String(body.roomId || "").trim();
    await assertActorCanAccessRoom(
      {
        id: authed.user.id,
        role: authed.role,
        organizationId: authed.organizationId,
        isSuperadmin: authed.isSuperadmin,
        isGuest: authed.isGuest,
      },
      roomId
    );
    const result = await generateExecutiveReportForRoom(roomId);
    return res.status(200).json(result);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Falha ao gerar relatório executivo.";
    console.error("AI generate report error:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
