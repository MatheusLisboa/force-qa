import { OllamaProvider } from "./providers/ollama";
import { OpenRouterProvider } from "./providers/openRouter";
import type { AIProvider } from "./types";

export function createAIProvider(): AIProvider {
  const configured = (process.env.AI_PROVIDER || "").toLowerCase().trim();

  if (configured === "ollama" || (!configured && process.env.OLLAMA_BASE_URL)) {
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "llama3.2";
    return new OllamaProvider(model, baseUrl);
  }

  if (configured === "openrouter" || process.env.OPENROUTER_API_KEY) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY é obrigatória quando AI_PROVIDER=openrouter.");
    }
    const model =
      process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
    return new OpenRouterProvider(apiKey, model);
  }

  throw new Error(
    "Nenhum provider de IA configurado. Defina AI_PROVIDER=openrouter ou ollama e as variáveis correspondentes."
  );
}
