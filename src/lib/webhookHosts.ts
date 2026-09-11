export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "hooks.slack.com") return true;
    if (host === "discord.com" || host.endsWith(".discord.com")) return true;
    if (host === "discordapp.com" || host.endsWith(".discordapp.com")) return true;
    return false;
  } catch {
    return false;
  }
}
