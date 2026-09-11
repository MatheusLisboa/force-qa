import { describe, expect, it } from "vitest";
import { isAllowedWebhookUrl } from "./webhookHosts";

describe("isAllowedWebhookUrl", () => {
  it("allows Slack and Discord https hosts", () => {
    expect(isAllowedWebhookUrl("https://hooks.slack.com/services/T/B/xxx")).toBe(true);
    expect(isAllowedWebhookUrl("https://discord.com/api/webhooks/1/abc")).toBe(true);
    expect(isAllowedWebhookUrl("https://ptb.discord.com/api/webhooks/1/abc")).toBe(true);
    expect(isAllowedWebhookUrl("https://discordapp.com/api/webhooks/1/abc")).toBe(true);
  });

  it("rejects other hosts and http", () => {
    expect(isAllowedWebhookUrl("http://hooks.slack.com/services/T/B/xxx")).toBe(false);
    expect(isAllowedWebhookUrl("https://example.com/webhook")).toBe(false);
    expect(isAllowedWebhookUrl("https://hooks.slack.com.evil.example/x")).toBe(false);
    expect(isAllowedWebhookUrl("not-a-url")).toBe(false);
  });
});
