import { GoogleGenAI, Type } from "@google/genai";
import { envVar } from "./auth";

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = envVar("GEMINI_API_KEY");
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

function parseJsonResponse(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : trimmed).trim();
  return JSON.parse(raw);
}

async function completeJsonViaOpenRouter(userPrompt: string, schemaHint: string): Promise<unknown> {
  const apiKey = envVar("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw Object.assign(
      new Error("Nenhum provider de IA configurado. Defina GEMINI_API_KEY ou OPENROUTER_API_KEY."),
      { status: 503 }
    );
  }

  const model = envVar("OPENROUTER_MODEL") || "google/gemini-2.5-flash";
  const vercelUrl = envVar("VERCEL_URL");
  const appUrl =
    envVar("APP_URL") || (vercelUrl ? `https://${vercelUrl}` : "https://force-qa.vercel.app");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": appUrl,
      "X-Title": "ForceQA AI",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You return only valid JSON matching this schema: ${schemaHint}`,
        },
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
  return parseJsonResponse(content);
}

async function generateStructuredJson(
  geminiFn: () => Promise<unknown>,
  openRouterPrompt: string,
  schemaHint: string
): Promise<unknown> {
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      return await geminiFn();
    } catch (err) {
      if (!envVar("OPENROUTER_API_KEY")) throw err;
    }
  }
  return completeJsonViaOpenRouter(openRouterPrompt, schemaHint);
}

const SUGGEST_SCHEMA =
  '{ "criticism": "blocker|critical|high|medium|low", "priority": "immediate|high|medium|low", "type": "bug|requirement|ihc|product|improvement|ui_adjustment|performance|security", "tags": ["string"], "explanation": "string" }';

const DUPLICATE_SCHEMA =
  '{ "isDuplicate": boolean, "duplicateOfBugId": "string|null", "confidenceScore": 0-100, "explanation": "string" }';

export async function suggestBugFields(title: string, description?: string) {
  if (!title?.trim()) {
    throw Object.assign(new Error("O título é obrigatório para a sugestão."), { status: 400 });
  }

  const prompt = `Analyze this reported issue to suggest structured categories, criticism level, priority level, and type.
Bug Title: ${title}
Bug Description: ${description || "No description provided."}

Return the results matching the required JSON schema. Keep tags to a maximum of 3 highly relative, lowercase words (e.g., "frontend", "login", "api", "css", "db").`;

  return generateStructuredJson(
    async () => {
      const ai = getGeminiClient()!;
      const result = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              criticism: {
                type: Type.STRING,
                description: "Must be one of: 'blocker', 'critical', 'high', 'medium', 'low'",
              },
              priority: {
                type: Type.STRING,
                description: "Must be one of: 'immediate', 'high', 'medium', 'low'",
              },
              type: {
                type: Type.STRING,
                description:
                  "Must be one of: 'bug', 'requirement', 'ihc', 'product', 'improvement', 'ui_adjustment', 'performance', 'security'",
              },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "An array of 1-3 useful classification tags",
              },
              explanation: { type: Type.STRING, description: "Brief 1-sentence reasoning for these choices." },
            },
            required: ["criticism", "priority", "type", "tags", "explanation"],
          },
        },
      });
      const text = result.text;
      if (!text) throw new Error("Empty response from AI model.");
      return JSON.parse(text);
    },
    prompt,
    SUGGEST_SCHEMA
  );
}

export async function detectDuplicate(
  title: string,
  description: string | undefined,
  existingBugs: Array<{ id?: string; title?: string; description?: string }>
) {
  if (!title?.trim() || !Array.isArray(existingBugs)) {
    throw Object.assign(new Error("Informe o título e a lista de cards existentes."), { status: 400 });
  }

  if (existingBugs.length === 0) {
    return {
      isDuplicate: false,
      duplicateOfBugId: null,
      confidenceScore: 0,
      explanation: "No existing bugs to compare against.",
    };
  }

  const compiledBugs = existingBugs
    .slice(0, 80)
    .map((b) => `ID: ${b.id}\nTitle: ${b.title}\nDescription: ${b.description || "N/A"}\n---`)
    .join("\n");

  const prompt = `You are a Senior QA Specialist. Check if this new bug report duplicates an existing bug report already in our list.
New Bug Title: ${title}
New Bug Description: ${description || "No description provided."}

Here is the list of existing reported issues:
${compiledBugs}

Evaluate the similarity and return whether this represents a duplicate issue.`;

  return generateStructuredJson(
    async () => {
      const ai = getGeminiClient()!;
      const result = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isDuplicate: { type: Type.BOOLEAN },
              duplicateOfBugId: {
                type: Type.STRING,
                description: "The exact ID of the duplicated bug, or null if not a duplicate",
              },
              confidenceScore: { type: Type.INTEGER, description: "Closeness rating from 0 to 100" },
              explanation: {
                type: Type.STRING,
                description: "A detailed 1-2 sentence explanation comparing features/symptoms",
              },
            },
            required: ["isDuplicate", "duplicateOfBugId", "confidenceScore", "explanation"],
          },
        },
      });
      const text = result.text;
      if (!text) throw new Error("Empty response from AI model.");
      return JSON.parse(text);
    },
    prompt,
    DUPLICATE_SCHEMA
  );
}
