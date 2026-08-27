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

// api-src/ai/detect-duplicate.ts
var detect_duplicate_exports = {};
__export(detect_duplicate_exports, {
  default: () => handler
});
module.exports = __toCommonJS(detect_duplicate_exports);

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

// api-src/shared/geminiBugs.ts
var import_genai = require("@google/genai");
var aiClient = null;
function getGeminiClient() {
  const apiKey = envVar("GEMINI_API_KEY");
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new import_genai.GoogleGenAI({ apiKey });
  }
  return aiClient;
}
function parseJsonResponse(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced ? fenced[1] : trimmed).trim();
  return JSON.parse(raw);
}
async function completeJsonViaOpenRouter(userPrompt, schemaHint) {
  const apiKey = envVar("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw Object.assign(
      new Error("Nenhum provider de IA configurado. Defina GEMINI_API_KEY ou OPENROUTER_API_KEY."),
      { status: 503 }
    );
  }
  const model = envVar("OPENROUTER_MODEL") || "google/gemini-2.5-flash";
  const vercelUrl = envVar("VERCEL_URL");
  const appUrl = envVar("APP_URL") || (vercelUrl ? `https://${vercelUrl}` : "https://force-qa.vercel.app");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": appUrl,
      "X-Title": "ForceQA AI"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You return only valid JSON matching this schema: ${schemaHint}`
        },
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
  return parseJsonResponse(content);
}
async function generateStructuredJson(geminiFn, openRouterPrompt, schemaHint) {
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
var DUPLICATE_SCHEMA = '{ "isDuplicate": boolean, "duplicateOfBugId": "string|null", "confidenceScore": 0-100, "explanation": "string" }';
async function detectDuplicate(title, description, existingBugs) {
  if (!title?.trim() || !Array.isArray(existingBugs)) {
    throw Object.assign(new Error("Informe o t\xEDtulo e a lista de cards existentes."), { status: 400 });
  }
  if (existingBugs.length === 0) {
    return {
      isDuplicate: false,
      duplicateOfBugId: null,
      confidenceScore: 0,
      explanation: "No existing bugs to compare against."
    };
  }
  const compiledBugs = existingBugs.slice(0, 80).map((b) => `ID: ${b.id}
Title: ${b.title}
Description: ${b.description || "N/A"}
---`).join("\n");
  const prompt = `You are a Senior QA Specialist. Check if this new bug report duplicates an existing bug report already in our list.
New Bug Title: ${title}
New Bug Description: ${description || "No description provided."}

Here is the list of existing reported issues:
${compiledBugs}

Evaluate the similarity and return whether this represents a duplicate issue.`;
  return generateStructuredJson(
    async () => {
      const ai = getGeminiClient();
      const result = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: import_genai.Type.OBJECT,
            properties: {
              isDuplicate: { type: import_genai.Type.BOOLEAN },
              duplicateOfBugId: {
                type: import_genai.Type.STRING,
                description: "The exact ID of the duplicated bug, or null if not a duplicate"
              },
              confidenceScore: { type: import_genai.Type.INTEGER, description: "Closeness rating from 0 to 100" },
              explanation: {
                type: import_genai.Type.STRING,
                description: "A detailed 1-2 sentence explanation comparing features/symptoms"
              }
            },
            required: ["isDuplicate", "duplicateOfBugId", "confidenceScore", "explanation"]
          }
        }
      });
      const text = result.text;
      if (!text) throw new Error("Empty response from AI model.");
      return JSON.parse(text);
    },
    prompt,
    DUPLICATE_SCHEMA
  );
}

// api-src/ai/detect-duplicate.ts
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await requireUser(req.headers.authorization);
    const body = readJsonBody(req.body);
    const result = await detectDuplicate(
      String(body.title || ""),
      typeof body.description === "string" ? body.description : void 0,
      Array.isArray(body.existingBugs) ? body.existingBugs : []
    );
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to detect duplicates";
    console.error("AI detect duplicate error:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
module.exports = module.exports.default || module.exports;
