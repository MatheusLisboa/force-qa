import type { AIProvider } from "../types";

const DEFAULT_BASE_URL = "http://localhost:11434";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;

  constructor(model: string, baseUrl = DEFAULT_BASE_URL) {
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
