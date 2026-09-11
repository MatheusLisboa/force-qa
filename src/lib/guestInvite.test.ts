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
