import { describe, expect, it } from "vitest";
import { GUEST_TOKEN_PREFIX, generateGuestInviteToken, looksLikeGuestToken } from "./guestInvite";

describe("guestInvite", () => {
  it("generates a gst_ token long enough to use as a secret", () => {
    const token = generateGuestInviteToken();
    expect(token.startsWith(GUEST_TOKEN_PREFIX)).toBe(true);
    expect(looksLikeGuestToken(token)).toBe(true);
    expect(looksLikeGuestToken("sala-1")).toBe(false);
    expect(looksLikeGuestToken("gst_short")).toBe(false);
  });
});

import { describeInviteExpiry, inviteExpiryFromDays, isInviteExpired } from "./guestInvite";

describe("validade do convite", () => {
  const now = new Date("2026-10-12T12:00:00Z");

  it("sem data nunca expira", () => {
    expect(isInviteExpired(null, now)).toBe(false);
    expect(isInviteExpired(undefined, now)).toBe(false);
    expect(inviteExpiryFromDays(null, now)).toBeNull();
  });

  it("expira exatamente no instante marcado", () => {
    expect(isInviteExpired("2026-10-12T11:59:59Z", now)).toBe(true);
    expect(isInviteExpired("2026-10-12T12:00:00Z", now)).toBe(true);
    expect(isInviteExpired("2026-10-12T12:00:01Z", now)).toBe(false);
  });

  it("data inválida não bloqueia (falha aberta só para lixo, nunca para data real)", () => {
    expect(isInviteExpired("lixo", now)).toBe(false);
  });

  it("calcula a data a partir de dias", () => {
    expect(inviteExpiryFromDays(7, now)).toBe("2026-10-19T12:00:00.000Z");
    expect(inviteExpiryFromDays(1, now)).toBe("2026-10-13T12:00:00.000Z");
  });

  it("descreve para a interface", () => {
    expect(describeInviteExpiry(null, now)).toBe("sem validade");
    expect(describeInviteExpiry("2026-10-12T11:00:00Z", now)).toBe("expirado");
    expect(describeInviteExpiry("2026-10-12T15:00:00Z", now)).toBe("expira em 3 h");
    expect(describeInviteExpiry("2026-10-19T12:00:00Z", now)).toBe("expira em 7 dias");
  });
});
