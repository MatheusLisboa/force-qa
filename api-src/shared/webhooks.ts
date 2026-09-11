import { isAllowedWebhookUrl } from "../../src/lib/webhookHosts";
import { getSupabaseAdmin } from "./auth";
import { appRedirectTo } from "./appUrl";

export type WebhookKind = "blocker" | "ready_for_qa";
export { isAllowedWebhookUrl };

function isHttpsWebhook(url: string): boolean {
  return isAllowedWebhookUrl(url);
}

export function webhookPayload(input: {
  kind: WebhookKind;
  roomName: string;
  title: string;
  url: string;
}): { text: string; content: string } {
  const label = input.kind === "blocker" ? "Blocker" : "Pronto para QA";
  const text = `${label} · ${input.roomName}\n${input.title}\n${input.url}`;
  return { text, content: text };
}

export async function getOrgWebhookUrl(organizationId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("organization_integrations")
    .select("webhook_url")
    .eq("organization_id", organizationId)
    .maybeSingle();
  const url = String(data?.webhook_url || "").trim();
  return isHttpsWebhook(url) ? url : null;
}

export async function setOrgWebhookUrl(organizationId: string, webhookUrl: string | null): Promise<void> {
  const admin = getSupabaseAdmin();
  const trimmed = (webhookUrl || "").trim();
  if (trimmed && !isHttpsWebhook(trimmed)) {
    throw Object.assign(new Error("O webhook precisa ser https:// do Slack ou Discord."), { status: 400 });
  }
  const { error } = await admin.from("organization_integrations").upsert({
    organization_id: organizationId,
    webhook_url: trimmed || null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw Object.assign(new Error("Não foi possível salvar o webhook."), { status: 500 });
  }
}

export async function dispatchRoomWebhook(input: {
  organizationId: string;
  kind: WebhookKind;
  roomId: string;
  roomName: string;
  bugId: string;
  title: string;
}): Promise<void> {
  const hook = await getOrgWebhookUrl(input.organizationId);
  if (!hook) return;
  const url = `${appRedirectTo().replace(/\/$/, "")}/?room=${encodeURIComponent(input.roomId)}&card=${encodeURIComponent(input.bugId)}`;
  const body = webhookPayload({
    kind: input.kind,
    roomName: input.roomName,
    title: input.title,
    url,
  });
  const response = await fetch(hook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
  });
  if (!response.ok) {
    throw Object.assign(new Error(`Webhook respondeu ${response.status}.`), { status: 502 });
  }
}
