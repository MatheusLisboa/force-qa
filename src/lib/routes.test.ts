import { describe, expect, it } from "vitest";
import { adminBoardViewsPath, adminOrganizationsPath, adminUsersPath, cardUrl, dashboardPath, inboxPath, parseRoomInvite, roomPath } from "./routes";

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
    expect(adminOrganizationsPath()).toBe("/admin/organizations");
  });

  it("parses invite links into a room id", () => {
    expect(parseRoomInvite("https://app.example/?room=sala-1")).toBe("sala-1");
    expect(parseRoomInvite("/?room=sala-1&pulse=open")).toBe("sala-1");
    expect(parseRoomInvite("sala-1")).toBe("sala-1");
  });
});
