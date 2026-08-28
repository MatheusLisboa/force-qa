import { UserRole } from "../types";

export function canWriteBugs(role?: UserRole | string | null): boolean {
  return Boolean(role) && role !== "viewer";
}

export function canManageSpaces(role?: UserRole | string | null): boolean {
  return role === "admin" || role === "qa" || role === "scrum_master";
}

export function canInviteToRoom(role?: UserRole | string | null): boolean {
  return role === "admin" || role === "qa" || role === "scrum_master";
}

export function canArchiveBugs(role?: UserRole | string | null): boolean {
  return role === "admin" || role === "qa" || role === "scrum_master";
}

export function canManageUsers(
  role?: UserRole | string | null,
  isSuperadmin?: boolean
): boolean {
  return Boolean(isSuperadmin) || role === "admin";
}

export function canManageOrganizations(isSuperadmin?: boolean): boolean {
  return Boolean(isSuperadmin);
}

export function canAssignBugs(role?: UserRole | string | null): boolean {
  return canWriteBugs(role);
}

export const SIGNUP_ROLES: UserRole[] = [
  "qa",
  "developer",
  "dba",
  "devops",
  "scrum_master",
  "viewer",
];
