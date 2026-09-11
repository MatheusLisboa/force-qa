import { describe, expect, it } from "vitest";
import { adminBoardViewsPath, adminIntegrationsPath, adminOrganizationsPath, adminPermissionsPath, adminUsersPath, cardUrl, dashboardPath, inboxPath, parseGuestInvite, parseRoomInvite, roomInviteUrl, roomPath } from "./routes";

describe("routes", () => {
  it("builds dashboard, room and admin paths", () => {
    expect(dashboardPath()).toBe("/");
    expect(inboxPath()).toBe("/inbox");
    expect(roomPath("abc 1")).toBe("/?room=abc+1");
    expect(roomPath("abc", "blockers")).toBe("/?room=abc&pulse=blockers");
    expect(roomPath("abc", "all", "card-1")).toBe("/?room=abc&card=card-1");
    expect(cardUrl("abc", "card-1", "https://app.example")).toBe("https://app.example/?room=abc&card=card-1");
    expect(adminBoardViewsPath()).toBe("/admin/board-views");
    expect(adminBoardViewsPath("p1")).toBe("/admin/board-views?project=p1");
    expect(adminUsersPath()).toBe("/admin/users");
    expect(adminIntegrationsPath()).toBe("/admin/integrations");
    expect(adminOrganizationsPath()).toBe("/admin/organizations");
    expect(adminPermissionsPath()).toBe("/admin/permissions");
  });

  it("parses invite links into a room id", () => {
    expect(parseRoomInvite("https://app.example/?room=sala-1")).toBe("sala-1");
    expect(parseRoomInvite("/?room=sala-1&pulse=open")).toBe("sala-1");
    expect(parseRoomInvite("sala-1")).toBe("sala-1");
  });

  it("builds and parses guest invite links", () => {
    expect(roomInviteUrl("sala-1", "https://app.example", "gst_abc123def456ghi789")).toBe(
      "https://app.example/?room=sala-1&guest=gst_abc123def456ghi789"
    );
    expect(parseGuestInvite("https://app.example/?room=sala-1&guest=gst_abc123def456ghi789")).toEqual({
      roomId: "sala-1",
      token: "gst_abc123def456ghi789",
    });
    expect(parseGuestInvite("gst_abc123def456ghi789").token).toBe("gst_abc123def456ghi789");
    expect(parseGuestInvite("sala-1")).toEqual({ roomId: "sala-1", token: "" });
  });
});
