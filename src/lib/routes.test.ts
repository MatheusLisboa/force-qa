import { describe, expect, it } from "vitest";
import { adminBoardViewsPath, adminUsersPath, dashboardPath, roomPath } from "./routes";

describe("routes", () => {
  it("builds dashboard, room and admin paths", () => {
    expect(dashboardPath()).toBe("/");
    expect(roomPath("abc 1")).toBe("/?room=abc%201");
    expect(adminBoardViewsPath()).toBe("/admin/board-views");
    expect(adminBoardViewsPath("p1")).toBe("/admin/board-views?project=p1");
    expect(adminUsersPath()).toBe("/admin/users");
  });
});
