import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { generateExecutiveReport } from "./server/ai/generateReport";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" })); // Allow payload sizes for evidence embedding

const PORT = 3000;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabaseAdmin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY e VITE_SUPABASE_URL são obrigatórios para operações admin.");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifyAdminToken(authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Token de autenticação ausente.");
  }
  const token = authHeader.slice(7);
  const supabaseAdmin = getSupabaseAdmin();
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw new Error("Sessão inválida ou expirada.");

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    throw new Error("Apenas administradores podem executar esta operação.");
  }
  return user;
}

// -------------------------
// Admin: Create User
// -------------------------
app.post("/api/admin/create-user", async (req, res) => {
  try {
    await verifyAdminToken(req.headers.authorization);
    const { name, email, password, role, squad } = req.body;
    if (!name || !email || !password || !role || !squad) {
      res.status(400).json({ error: "Todos os campos são obrigatórios." });
      return;
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
    });
    if (error) throw error;
    if (!data.user) throw new Error("Falha ao criar usuário no Auth.");

    const { error: profileError } = await supabaseAdmin.from("users").insert({
      id: data.user.id,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      squad: squad.trim(),
    });
    if (profileError) throw profileError;

    res.json({ success: true, userId: data.user.id });
  } catch (error: any) {
    console.error("Admin create user error:", error);
    res.status(500).json({ error: error.message || "Falha ao criar usuário." });
  }
});

// Lazy initialization of Gemini client to prevent crashes if key is omitted
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required to execute AI operations.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// -------------------------
// 1. API: Suggest Bug Attributes
// -------------------------
app.post("/api/ai/suggest-bug-fields", async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) {
      res.status(400).json({ error: "Bug title is required for suggestion." });
      return;
    }

    const ai = getGeminiClient();
    const prompt = `Analyze this reported issue to suggest structured categories, criticism level, priority level, and type.
Bug Title: ${title}
Bug Description: ${description || "No description provided."}

Return the results matching the required JSON schema. Keep tags to a maximum of 3 highly relative, lowercase words (e.g., "frontend", "login", "api", "css", "db").`;

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
              description: "Must be one of: 'blocker', 'critical', 'high', 'medium', 'low'"
            },
            priority: {
              type: Type.STRING,
              description: "Must be one of: 'immediate', 'high', 'medium', 'low'"
            },
            type: {
              type: Type.STRING,
              description: "Must be one of: 'bug', 'improvement', 'ui_adjustment', 'performance', 'security'"
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "An array of 1-3 useful classification tags"
            },
            explanation: {
              type: Type.STRING,
              description: "Brief 1-sentence reasoning for these choices."
            }
          },
          required: ["criticism", "priority", "type", "tags", "explanation"]
        }
      }
    });

    const text = result.text;
    if (!text) {
      throw new Error("Empty response from AI model.");
    }
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("AI suggest fields error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze bug fields" });
  }
});

// -------------------------
// 2. API: Detect Duplicate Bug
// -------------------------
app.post("/api/ai/detect-duplicate", async (req, res) => {
  try {
    const { title, description, existingBugs } = req.body;
    if (!title || !existingBugs || !Array.isArray(existingBugs)) {
      res.status(400).json({ error: "Missing title or existing bugs list." });
      return;
    }

    if (existingBugs.length === 0) {
      res.json({ isDuplicate: false, duplicateOfBugId: null, confidenceScore: 0, explanation: "No existing bugs to compare against." });
      return;
    }

    const compiledBugs = existingBugs.map((b: any) => `ID: ${b.id}\nTitle: ${b.title}\nDescription: ${b.description || "N/A"}\n---`).join("\n");

    const ai = getGeminiClient();
    const prompt = `You are a Senior QA Specialist. Check if this new bug report duplicates an existing bug report already in our list.
New Bug Title: ${title}
New Bug Description: ${description || "No description provided."}

Here is the list of existing reported issues:
${compiledBugs}

Evaluate the similarity and return whether this represents a duplicate issue.`;

    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isDuplicate: { type: Type.BOOLEAN },
            duplicateOfBugId: { type: Type.STRING, description: "The exact ID of the duplicated bug, or null if not a duplicate" },
            confidenceScore: { type: Type.INTEGER, description: "Closeness rating from 0 to 100" },
            explanation: { type: Type.STRING, description: "A detailed 1-2 sentence explanation comparing features/symptoms" }
          },
          required: ["isDuplicate", "duplicateOfBugId", "confidenceScore", "explanation"]
        }
      }
    });

    const text = result.text;
    if (!text) {
      throw new Error("Empty response from AI model.");
    }
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("AI detect duplicate error:", error);
    res.status(500).json({ error: error.message || "Failed to detect duplicates" });
  }
});

// -------------------------
// 3. API: Generate Executive QA Report (aggregated metrics)
// -------------------------
app.post("/api/ai/generate-report", async (req, res) => {
  try {
    const result = await generateExecutiveReport(req.body?.metrics);
    res.json(result);
  } catch (error: any) {
    console.error("AI generate report error:", error);
    res.status(500).json({ error: error.message || "Falha ao gerar relatório executivo." });
  }
});

// -------------------------
// 4. API: Generate War Room Summary Report (legacy)
// -------------------------
app.post("/api/ai/summarize-warroom", async (req, res) => {
  try {
    const { warRoom, bugs } = req.body;
    if (!warRoom || !bugs || !Array.isArray(bugs)) {
      res.status(400).json({ error: "War Room and Bugs data are required." });
      return;
    }

    const compiledBugs = bugs.map((b: any) => `- [${b.type.toUpperCase()}] status: ${b.status} / criticism: ${b.criticism} / title: ${b.title} / assigned to: ${b.ownerName || "Unassigned"}`).join("\n");

    const ai = getGeminiClient();
    const prompt = `You are an elite QA Commander. Generate a highly polished, professional operational summary report for a War Room QA operation.
War Room Info:
- Name: ${warRoom.name}
- System/Project: ${warRoom.project}
- Squad: ${warRoom.squad}
- Date: ${warRoom.date}
- Description: ${warRoom.description || "N/A"}
- Overall Severity: ${warRoom.severity}
- State: ${warRoom.status}

Reported Tasks/Bugs list:
${compiledBugs || "(No items found)"}

Please write a highly authoritative, structured summary. Structure using markdown (headings, bullets, accents). Format the response as a JSON object containing the markdown content. Do not include extra wrappers around the JSON.`;

    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A striking report title" },
            executiveSummary: { type: Type.STRING, description: "One paragraph summary overview of the operation" },
            markdownReport: { type: Type.STRING, description: "A comprehensive markdown report with sections: 'Status Recap', 'Resolved Wins', 'Immediate Bottlenecks & Critical Risks', 'Developer Heroes / Load Distribution', 'Concrete Recommendation & Blockers'" }
          },
          required: ["title", "executiveSummary", "markdownReport"]
        }
      }
    });

    const text = result.text;
    if (!text) {
      throw new Error("Empty response from AI model.");
    }
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("AI war room summary error:", error);
    res.status(500).json({ error: error.message || "Failed to generate AI report" });
  }
});

// -------------------------
// Vite Dev Server / Static Assets Fallback
// -------------------------
async function initServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite Middlewares in Dev
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Static build in Production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[War Room Server] fully running on HTTP port ${PORT} in ${process.env.NODE_ENV || "development"} mode.`);
  });
}

initServer();
