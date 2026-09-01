import { UserRole } from "../types";
import { canManageUsers, SIGNUP_ROLES } from "./permissions";

export const DEFAULT_INVITE_ROLE: UserRole = "developer";

const ALL_INVITE_ROLES: UserRole[] = ["admin", ...SIGNUP_ROLES];

export function inviteRoleHint(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin da org: usuários, visões e convites. Use com cuidado.";
    case "qa":
      return "QA: escreve cards, convida e opera a sala.";
    case "scrum_master":
      return "Scrum: escreve cards, convida e opera a sala.";
    case "viewer":
      return "Só lê o Kanban. Não cria nem move cards.";
    default:
      return "Pode escrever cards nesta org.";
  }
}

export function inviteRolesForActor(
  role?: string | null,
  isSuperadmin?: boolean
): UserRole[] {
  if (canManageUsers(role, isSuperadmin)) return ALL_INVITE_ROLES;
  return [...SIGNUP_ROLES];
}

/** Papel que o convite pode gravar. Admin só se quem convida for admin da org. */
export function resolveInviteRole(
  requested: string | undefined,
  actorRole?: string | null,
  isSuperadmin?: boolean
): UserRole {
  const allowed = inviteRolesForActor(actorRole, isSuperadmin);
  if (requested && allowed.includes(requested as UserRole)) {
    return requested as UserRole;
  }
  return DEFAULT_INVITE_ROLE;
}
