import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVITE_ROLE,
  inviteRoleHint,
  inviteRolesForActor,
  resolveInviteRole,
} from "./inviteRole";

describe("inviteRole", () => {
  it("lets org admin grant admin, and keeps QA off that option", () => {
    expect(inviteRolesForActor("admin")).toContain("admin");
    expect(inviteRolesForActor("qa")).not.toContain("admin");
    expect(inviteRolesForActor("qa", true)).toContain("admin");
  });

  it("accepts a permitted role and falls back when the pick is illegal", () => {
    expect(resolveInviteRole("qa", "scrum_master")).toBe("qa");
    expect(resolveInviteRole("admin", "qa")).toBe(DEFAULT_INVITE_ROLE);
    expect(resolveInviteRole("admin", "admin")).toBe("admin");
    expect(resolveInviteRole("nope", "admin")).toBe(DEFAULT_INVITE_ROLE);
  });

  it("explains viewer vs write roles in the invite copy", () => {
    expect(inviteRoleHint("viewer")).toMatch(/lê/i);
    expect(inviteRoleHint("developer")).toMatch(/escrever/i);
    expect(inviteRoleHint("admin")).toMatch(/cuidado/i);
  });
});
