import { describe, expect, it } from "vitest";
import { diffRoomAccess } from "./roomAccess";

describe("diffRoomAccess", () => {
  it("adds newly checked rooms and removes unchecked ones", () => {
    expect(diffRoomAccess(["a", "b"], ["b", "c"])).toEqual({
      add: ["c"],
      remove: ["a"],
    });
  });

  it("keeps the same set unchanged", () => {
    expect(diffRoomAccess(["a"], ["a"])).toEqual({ add: [], remove: [] });
  });
});

import { canSelfJoinRoom, parseGuestPermission, parseRoomVisibility } from "./roomAccess";

describe("canSelfJoinRoom", () => {
  const base = { visibility: "organization" as const, isMember: false, isOrgAdmin: false, isSuperadmin: false };

  it("sala da organização: qualquer interno entra", () => {
    expect(canSelfJoinRoom(base)).toEqual({ allowed: true });
  });

  it("sala somente membros: recusa quem não é membro, com motivo", () => {
    const result = canSelfJoinRoom({ ...base, visibility: "members" });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/restrita a membros/);
  });

  it("sala somente membros: membro, admin da org e superadmin entram", () => {
    expect(canSelfJoinRoom({ ...base, visibility: "members", isMember: true }).allowed).toBe(true);
    expect(canSelfJoinRoom({ ...base, visibility: "members", isOrgAdmin: true }).allowed).toBe(true);
    expect(canSelfJoinRoom({ ...base, visibility: "members", isSuperadmin: true }).allowed).toBe(true);
  });
});

describe("parseRoomVisibility / parseGuestPermission", () => {
  it("valores desconhecidos caem no padrão seguro para cada caso", () => {
    expect(parseRoomVisibility("members")).toBe("members");
    expect(parseRoomVisibility("publica")).toBe("organization");
    expect(parseRoomVisibility(undefined)).toBe("organization");
    expect(parseGuestPermission("read")).toBe("read");
    expect(parseGuestPermission("admin")).toBe("write");
    expect(parseGuestPermission("admin", "read")).toBe("read");
  });
});
