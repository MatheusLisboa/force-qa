import type { VercelRequest, VercelResponse } from "@vercel/node";
import { envVar, getSupabaseAdmin } from "../shared/auth";
import { logger } from "../shared/logger";

/**
 * Cron diário (vercel.json). Faz uma leitura barata no banco: isso mantém o projeto
 * ativo (o plano gratuito do Supabase pausa por inatividade) e avisa se ele não responde.
 * Alerta opcional: ALERT_WEBHOOK_URL (formato Slack/Discord/Teams: {"text": "..."}).
 */
export async function runKeepalive(
  probe: () => Promise<{ error: { message: string } | null }>,
  notify: (message: string) => Promise<void>
): Promise<{ ok: boolean; detail?: string }> {
  try {
    const { error } = await probe();
    if (error) throw new Error(error.message);
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await notify(`ForceQA: o Supabase não respondeu à verificação diária (${detail}). O projeto pode estar pausado.`).catch((e) =>
      logger.error("keepalive: falha ao enviar alerta", e)
    );
    return { ok: false, detail };
  }
}

async function postWebhook(message: string): Promise<void> {
  const url = envVar("ALERT_WEBHOOK_URL");
  if (!url || !url.startsWith("https://")) return;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, content: message }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // A Vercel envia "Authorization: Bearer $CRON_SECRET" quando CRON_SECRET está definido.
  const secret = envVar("CRON_SECRET");
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const result = await runKeepalive(async () => {
    const admin = getSupabaseAdmin();
    return admin.from("users").select("id", { head: true, count: "exact" }).limit(1);
  }, postWebhook);

  if (!result.ok) logger.error("keepalive: Supabase indisponível", result.detail);
  return res.status(result.ok ? 200 : 503).json(result);
}
