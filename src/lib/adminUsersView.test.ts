import { describe, expect, it } from "vitest";
import { DEFAULT_ORGANIZATION_ID } from "./organizations";
import { filterManagedUsers, roomsForOrganization } from "./adminUsersView";
import { UserProfile, WarRoom } from "../types";

function user(partial: Partial<UserProfile> & Pick<UserProfile, "id" | "email">): UserProfile {
  return {
    name: partial.name || "Pessoa",
    role: partial.role || "developer",
    squad: partial.squad || "QA",
    organizationId: partial.organizationId || DEFAULT_ORGANIZATION_ID,
    createdAt: partial.createdAt || "2026-01-01T00:00:00.000Z",
    isGuest: partial.isGuest,
    isSuperadmin: partial.isSuperadmin,
    ...partial,
  };
}

describe("filterManagedUsers", () => {
  const home = user({ id: "1", email: "a@x.com", name: "Ana", createdAt: "2026-08-01T00:00:00.000Z" });
  const other = user({
    id: "2",
    email: "b@x.com",
    name: "Bia",
    organizationId: "22222222-2222-4222-8222-222222222222",
    createdAt: "2026-08-20T00:00:00.000Z",
  });
  const guest = user({
    id: "3",
    email: "g@x.com",
    name: "Guest",
    isGuest: true,
    createdAt: "2026-08-28T00:00:00.000Z",
  });

  it("keeps a normal admin inside the home org and hides guests by default", () => {
    expect(
      filterManagedUsers([home, other, guest], { homeOrganizationId: DEFAULT_ORGANIZATION_ID }).map((u) => u.id)
    ).toEqual(["1"]);
  });

  it("lists every tenant for superadmin, newest first", () => {
    expect(
      filterManagedUsers([home, other], { isSuperadmin: true }).map((u) => u.id)
    ).toEqual(["2", "1"]);
  });

  it("filters by organization and can include guests", () => {
    expect(
      filterManagedUsers([home, other, guest], {
        isSuperadmin: true,
        organizationFilter: DEFAULT_ORGANIZATION_ID,
        includeGuests: true,
      }).map((u) => u.id)
    ).toEqual(["3", "1"]);
  });
});

describe("roomsForOrganization", () => {
  it("keeps rooms of the selected org", () => {
    const rooms = [
      { id: "r1", organizationId: DEFAULT_ORGANIZATION_ID },
      { id: "r2", organizationId: "other" },
    ] as WarRoom[];
    expect(roomsForOrganization(rooms, DEFAULT_ORGANIZATION_ID).map((r) => r.id)).toEqual(["r1"]);
  });
});
