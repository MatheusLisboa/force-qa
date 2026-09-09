import { describe, expect, it, afterEach } from "vitest";
import {
  actorHasCapability,
  canArchiveBugs,
  canAssignBugs,
  canGrantAdminRole,
  canInviteToRoom,
  canManageSpaces,
  canManageUsers,
  canManageIntegrations,
  canManageOrganizations,
  canManageViews,
  canWriteBugs,
  cloneRoleMatrix,
  DEFAULT_ROLE_MATRIX,
  matrixFromRows,
  resetRolePermissionMatrix,
  setRolePermissionMatrix,
  SIGNUP_ROLES,
} from "./permissions";

describe("permissions", () => {
  afterEach(() => {
    resetRolePermissionMatrix();
  });

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

  it("lets QA and Scrum manage integrations, not developers", () => {
    expect(canManageIntegrations("admin")).toBe(true);
    expect(canManageIntegrations("qa")).toBe(true);
    expect(canManageIntegrations("scrum_master")).toBe(true);
    expect(canManageIntegrations("developer")).toBe(false);
    expect(canManageIntegrations("qa", false, true)).toBe(false);
    expect(canManageIntegrations("viewer", true)).toBe(true);
  });

  it("keeps admin-only user management", () => {
    expect(canManageUsers("admin")).toBe(true);
    expect(canManageUsers("qa")).toBe(false);
    expect(canManageUsers("qa", true)).toBe(true);
    expect(canManageViews("admin")).toBe(true);
    expect(canManageViews("qa")).toBe(false);
  });

  it("reserves organizations for superadmin", () => {
    expect(canManageOrganizations(true)).toBe(true);
    expect(canManageOrganizations(false)).toBe(false);
    expect(canManageOrganizations()).toBe(false);
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

  it("lets superadmin grant admin, not QA", () => {
    expect(canGrantAdminRole("admin")).toBe(true);
    expect(canGrantAdminRole("qa")).toBe(false);
    expect(canGrantAdminRole("qa", true)).toBe(true);
  });

  it("honors a custom matrix without promoting QA to admin-grant", () => {
    const custom = cloneRoleMatrix(DEFAULT_ROLE_MATRIX);
    custom.developer.manage_spaces = true;
    custom.qa.manage_users = true;
    setRolePermissionMatrix(custom);
    expect(canManageSpaces("developer")).toBe(true);
    expect(canManageUsers("qa")).toBe(true);
    expect(canGrantAdminRole("qa")).toBe(false);
  });

  it("rebuilds a matrix from stored rows", () => {
    const matrix = matrixFromRows([
      { role: "viewer", capability: "write_cards", allowed: true },
    ]);
    expect(actorHasCapability({ role: "viewer" }, "write_cards", matrix)).toBe(true);
    expect(actorHasCapability({ role: "viewer" }, "invite_members", matrix)).toBe(false);
  });
});
