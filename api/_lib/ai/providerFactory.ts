import { OllamaProvider } from "./providers/ollama";
import { OpenRouterProvider } from "./providers/openRouter";
import type { AIProvider } from "./types";
import { envVar } from "./env";

export function createAIProvider(): AIProvider {
  const configured = (envVar("AI_PROVIDER") || "").toLowerCase();

  if (configured === "ollama" || (!configured && envVar("OLLAMA_BASE_URL"))) {
    const baseUrl = envVar("OLLAMA_BASE_URL") || "http://localhost:11434";
    const model = envVar("OLLAMA_MODEL") || "llama3.2";
    return new OllamaProvider(model, baseUrl);
  }

  const apiKey = envVar("OPENROUTER_API_KEY");
  if (configured === "openrouter" || apiKey) {
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY é obrigatória quando AI_PROVIDER=openrouter.");
    }
    const model = envVar("OPENROUTER_MODEL") || "google/gemini-2.5-flash";
    return new OpenRouterProvider(apiKey, model);
  }

  throw new Error(
    "Nenhum provider de IA configurado. Defina AI_PROVIDER=openrouter e OPENROUTER_API_KEY."
  );
}
