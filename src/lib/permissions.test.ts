import { describe, expect, it } from "vitest";
import {
  canArchiveBugs,
  canAssignBugs,
  canInviteToRoom,
  canManageSpaces,
  canManageUsers,
  canWriteBugs,
  SIGNUP_ROLES,
} from "./permissions";

describe("permissions", () => {
  it("blocks viewers from writing bugs", () => {
    expect(canWriteBugs("viewer")).toBe(false);
    expect(canWriteBugs("qa")).toBe(true);
    expect(canWriteBugs(null)).toBe(false);
  });

  it("limits space management to admin, qa and scrum master", () => {
    expect(canManageSpaces("admin")).toBe(true);
    expect(canManageSpaces("qa")).toBe(true);
    expect(canManageSpaces("scrum_master")).toBe(true);
    expect(canManageSpaces("developer")).toBe(false);
  });

  it("keeps admin-only user management", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("qa")).toBe(false);
    expect(canManageUsers("qa", true)).toBe(true);
  });

  it("aligns invite and archive with space managers", () => {
    expect(canInviteToRoom("qa")).toBe(true);
    expect(canArchiveBugs("scrum_master")).toBe(true);
    expect(canAssignBugs("developer")).toBe(true);
    expect(canAssignBugs("viewer")).toBe(false);
  });

  it("does not offer admin on public signup", () => {
    expect(SIGNUP_ROLES).not.toContain("admin");
    expect(SIGNUP_ROLES).toContain("viewer");
  });
});
