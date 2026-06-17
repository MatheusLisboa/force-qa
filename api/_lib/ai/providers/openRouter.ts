import type { AIProvider } from "../types";
import { envVar } from "../env";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export class OpenRouterProvider implements AIProvider {
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

    const response = await fetch(OPENROUTER_URL, {
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
