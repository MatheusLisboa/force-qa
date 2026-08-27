var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api-src/ai/generate-report.ts
var generate_report_exports = {};
__export(generate_report_exports, {
  default: () => handler,
  generateExecutiveReport: () => generateExecutiveReport
});
module.exports = __toCommonJS(generate_report_exports);

// api-src/shared/auth.ts
var import_supabase_js = require("@supabase/supabase-js");
function envVar(key) {
  const raw = process.env[key];
  if (!raw) return void 0;
  return raw.trim().replace(/^["']|["']$/g, "");
}
function getSupabaseAdmin() {
  const url = envVar("VITE_SUPABASE_URL") || envVar("SUPABASE_URL") || "";
  const key = envVar("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL s\xE3o obrigat\xF3rios para opera\xE7\xF5es de servidor.");
  }
  return (0, import_supabase_js.createClient)(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
async function requireUser(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) {
    throw Object.assign(new Error("Token de autentica\xE7\xE3o ausente."), { status: 401 });
  }
  const token = authHeader.slice(7);
  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) {
    throw Object.assign(new Error("Sess\xE3o inv\xE1lida ou expirada."), { status: 401 });
  }
  const { data: profile } = await admin.from("users").select("role, is_guest").eq("id", user.id).maybeSingle();
  return {
    user,
    role: profile?.role || "viewer",
    isGuest: Boolean(profile?.is_guest)
  };
}
function httpErrorStatus(error, fallback = 500) {
  if (error && typeof error === "object" && "status" in error && typeof error.status === "number") {
    return error.status;
  }
  return fallback;
}
function readJsonBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof body === "object") return body;
  return {};
}

// api-src/ai/generate-report.ts
function envVar2(key) {
  const raw = process.env[key];
  if (!raw) return void 0;
  return raw.trim().replace(/^["']|["']$/g, "");
}
var REPORT_SYSTEM_PROMPT = `Voc\xEA \xE9 um QA Manager e Engineering Manager experiente.
Sua tarefa \xE9 produzir um relat\xF3rio executivo de QA em Markdown para gestores.

Regras obrigat\xF3rias:
- Use APENAS os dados num\xE9ricos e fatos fornecidos no contexto JSON.
- N\xC3O invente m\xE9tricas, bugs, squads, tend\xEAncias ou n\xFAmeros ausentes.
- Se um dado n\xE3o existir ou for zero, declare explicitamente a limita\xE7\xE3o.
- Linguagem executiva, objetiva e acion\xE1vel em portugu\xEAs do Brasil.
- Identifique gargalos, riscos e \xE1reas problem\xE1ticas com base nos n\xFAmeros.
- N\xE3o inclua blocos de c\xF3digo JSON na resposta final.
- Retorne somente Markdown v\xE1lido.`;
function buildReportUserPrompt(metricsJson) {
  return `Com base EXCLUSIVAMENTE no contexto agregado abaixo, gere um relat\xF3rio executivo de QA.

Use exatamente esta estrutura de se\xE7\xF5es:

# Resumo Executivo

## Situa\xE7\xE3o Atual

## Principais Problemas

## Gargalos Identificados

## Tend\xEAncias

## Recomenda\xE7\xF5es

## Pr\xF3ximas A\xE7\xF5es

Contexto agregado (JSON):
${metricsJson}`;
}
var OpenRouterProvider = class {
  constructor(apiKey, model) {
    this.name = "openrouter";
    this.apiKey = apiKey;
    this.model = model;
  }
  async generateReport(systemPrompt, userPrompt) {
    const vercelUrl = envVar2("VERCEL_URL");
    const appUrl = envVar2("APP_URL") || (vercelUrl ? `https://${vercelUrl}` : "https://force-qa.vercel.app");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": appUrl,
        "X-Title": "ForceQA AI Report"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.3,
        max_tokens: 2200,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenRouter error (${response.status}): ${errText || response.statusText}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenRouter retornou resposta vazia.");
    return content;
  }
};
var OllamaProvider = class {
  constructor(model, baseUrl) {
    this.name = "ollama";
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }
  async generateReport(systemPrompt, userPrompt) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Ollama error (${response.status}): ${errText || response.statusText}`);
    }
    const data = await response.json();
    const content = data.message?.content?.trim();
    if (!content) throw new Error("Ollama retornou resposta vazia.");
    return content;
  }
};
function createAIProvider() {
  const configured = (envVar2("AI_PROVIDER") || "").toLowerCase();
  if (configured === "ollama" || !configured && envVar2("OLLAMA_BASE_URL")) {
    return new OllamaProvider(
      envVar2("OLLAMA_MODEL") || "llama3.2",
      envVar2("OLLAMA_BASE_URL") || "http://localhost:11434"
    );
  }
  const apiKey = envVar2("OPENROUTER_API_KEY");
  if (configured === "openrouter" || apiKey) {
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY \xE9 obrigat\xF3ria quando AI_PROVIDER=openrouter.");
    }
    return new OpenRouterProvider(apiKey, envVar2("OPENROUTER_MODEL") || "google/gemini-2.5-flash");
  }
  throw new Error(
    "Nenhum provider de IA configurado. Defina AI_PROVIDER=openrouter e OPENROUTER_API_KEY."
  );
}
async function generateExecutiveReport(metrics) {
  if (!metrics || typeof metrics !== "object") {
    throw new Error("M\xE9tricas agregadas s\xE3o obrigat\xF3rias.");
  }
  const provider = createAIProvider();
  const metricsJson = JSON.stringify(metrics, null, 2);
  const userPrompt = buildReportUserPrompt(metricsJson);
  const markdown = await provider.generateReport(REPORT_SYSTEM_PROMPT, userPrompt);
  return {
    markdown,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    provider: provider.name,
    model: provider.model
  };
}
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await requireUser(req.headers.authorization);
    const body = readJsonBody(req.body);
    const result = await generateExecutiveReport(body.metrics);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao gerar relat\xF3rio executivo.";
    console.error("AI generate report error:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  generateExecutiveReport
});
module.exports = module.exports.default || module.exports;
