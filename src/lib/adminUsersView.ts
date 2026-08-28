import { UserProfile, WarRoom } from "../types";
import { belongsToOrganization } from "./organizations";

export function filterManagedUsers(
  users: UserProfile[],
  options: {
    homeOrganizationId?: string;
    isSuperadmin?: boolean;
    organizationFilter?: string;
    query?: string;
    includeGuests?: boolean;
    organizationNameById?: Record<string, string>;
  }
): UserProfile[] {
  const query = (options.query || "").trim().toLowerCase();
  const orgFilter = options.organizationFilter || "all";

  return users
    .filter((usr) => Boolean(usr?.id))
    .filter((usr) => options.includeGuests || !usr.isGuest)
    .filter((usr) => {
      if (options.isSuperadmin) {
        if (orgFilter === "all") return true;
        return usr.organizationId === orgFilter;
      }
      return belongsToOrganization(usr.organizationId, options.homeOrganizationId);
    })
    .filter((usr) => {
      if (!query) return true;
      const orgName = options.organizationNameById?.[usr.organizationId] || "";
      return [usr.name, usr.email, usr.squad, usr.role, orgName].some((value) =>
        (value || "").toLowerCase().includes(query)
      );
    })
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || "") || 0;
      const rightTime = Date.parse(right.createdAt || "") || 0;
      return rightTime - leftTime;
    });
}

export function roomsForOrganization(
  rooms: WarRoom[],
  organizationId: string | undefined
): WarRoom[] {
  if (!organizationId) return [];
  return rooms.filter((room) => room.organizationId === organizationId);
}
