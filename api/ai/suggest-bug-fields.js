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

// api-src/ai/suggest-bug-fields.ts
var suggest_bug_fields_exports = {};
__export(suggest_bug_fields_exports, {
  default: () => handler
});
module.exports = __toCommonJS(suggest_bug_fields_exports);

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
var SUGGEST_SCHEMA = '{ "criticism": "blocker|critical|high|medium|low", "priority": "immediate|high|medium|low", "type": "bug|requirement|ihc|product|improvement|ui_adjustment|performance|security", "tags": ["string"], "explanation": "string" }';
async function suggestBugFields(title, description) {
  if (!title?.trim()) {
    throw Object.assign(new Error("O t\xEDtulo \xE9 obrigat\xF3rio para a sugest\xE3o."), { status: 400 });
  }
  const prompt = `Analyze this reported issue to suggest structured categories, criticism level, priority level, and type.
Bug Title: ${title}
Bug Description: ${description || "No description provided."}

Return the results matching the required JSON schema. Keep tags to a maximum of 3 highly relative, lowercase words (e.g., "frontend", "login", "api", "css", "db").`;
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
              criticism: {
                type: import_genai.Type.STRING,
                description: "Must be one of: 'blocker', 'critical', 'high', 'medium', 'low'"
              },
              priority: {
                type: import_genai.Type.STRING,
                description: "Must be one of: 'immediate', 'high', 'medium', 'low'"
              },
              type: {
                type: import_genai.Type.STRING,
                description: "Must be one of: 'bug', 'requirement', 'ihc', 'product', 'improvement', 'ui_adjustment', 'performance', 'security'"
              },
              tags: {
                type: import_genai.Type.ARRAY,
                items: { type: import_genai.Type.STRING },
                description: "An array of 1-3 useful classification tags"
              },
              explanation: { type: import_genai.Type.STRING, description: "Brief 1-sentence reasoning for these choices." }
            },
            required: ["criticism", "priority", "type", "tags", "explanation"]
          }
        }
      });
      const text = result.text;
      if (!text) throw new Error("Empty response from AI model.");
      return JSON.parse(text);
    },
    prompt,
    SUGGEST_SCHEMA
  );
}

// api-src/ai/suggest-bug-fields.ts
async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await requireUser(req.headers.authorization);
    const body = readJsonBody(req.body);
    const result = await suggestBugFields(
      String(body.title || ""),
      typeof body.description === "string" ? body.description : void 0
    );
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze bug fields";
    console.error("AI suggest fields error:", error);
    return res.status(httpErrorStatus(error)).json({ error: message });
  }
}
module.exports = module.exports.default || module.exports;
