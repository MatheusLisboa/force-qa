import { UserRole } from "../types";

export const SIGNUP_ROLES: UserRole[] = [
  "qa",
  "developer",
  "dba",
  "devops",
  "scrum_master",
  "viewer",
];

export const PERMISSION_ROLES: UserRole[] = [
  "admin",
  "qa",
  "scrum_master",
  "developer",
  "dba",
  "devops",
  "viewer",
];

export const PERMISSION_CAPABILITIES = [
  "write_cards",
  "assign_cards",
  "archive_cards",
  "use_ai",
  "manage_spaces",
  "invite_members",
  "manage_users",
  "manage_views",
  "manage_integrations",
] as const;

export type PermissionCapability = (typeof PERMISSION_CAPABILITIES)[number];

export type RolePermissionMatrix = Record<UserRole, Record<PermissionCapability, boolean>>;

export const GUEST_DENIED_CAPABILITIES: readonly PermissionCapability[] = [
  "use_ai",
  "manage_spaces",
  "invite_members",
  "manage_users",
  "manage_views",
  "manage_integrations",
];

export const PERMISSION_CAPABILITY_META: Record<
  PermissionCapability,
  { label: string; hint: string }
> = {
  write_cards: { label: "Escrever cards", hint: "Criar, editar e mover cards no Kanban." },
  assign_cards: { label: "Atribuir cards", hint: "Definir o responsável." },
  archive_cards: { label: "Arquivar cards", hint: "Arquivar card da sala." },
  use_ai: { label: "Usar IA", hint: "Sugestão de campos, duplicata e relatório." },
  manage_spaces: { label: "Criar salas", hint: "Nova war room, board e projeto." },
  invite_members: { label: "Convidar", hint: "Convite por e-mail e membros da sala." },
  manage_users: { label: "Usuários", hint: "Tela Usuários: criar, editar e acesso às salas." },
  manage_views: { label: "Visões", hint: "Tela Visões do board." },
  manage_integrations: { label: "Integrações", hint: "Webhook e token de extração." },
};

function allCaps(allowed: PermissionCapability[]): Record<PermissionCapability, boolean> {
  const row = {} as Record<PermissionCapability, boolean>;
  for (const cap of PERMISSION_CAPABILITIES) row[cap] = allowed.includes(cap);
  return row;
}

const SPACE_OPERATOR: PermissionCapability[] = [
  "write_cards",
  "assign_cards",
  "archive_cards",
  "use_ai",
  "manage_spaces",
  "invite_members",
  "manage_integrations",
];

const WRITER: PermissionCapability[] = ["write_cards", "assign_cards", "use_ai"];

/** Comportamento atual do app, usado se a tabela ainda não existir. */
export const DEFAULT_ROLE_MATRIX: RolePermissionMatrix = {
  admin: allCaps([...PERMISSION_CAPABILITIES]),
  qa: allCaps(SPACE_OPERATOR),
  scrum_master: allCaps(SPACE_OPERATOR),
  developer: allCaps(WRITER),
  dba: allCaps(WRITER),
  devops: allCaps(WRITER),
  viewer: allCaps([]),
};

export function emptyRoleMatrix(): RolePermissionMatrix {
  return {
    admin: allCaps([]),
    qa: allCaps([]),
    scrum_master: allCaps([]),
    developer: allCaps([]),
    dba: allCaps([]),
    devops: allCaps([]),
    viewer: allCaps([]),
  };
}

export function cloneRoleMatrix(matrix: RolePermissionMatrix): RolePermissionMatrix {
  const next = emptyRoleMatrix();
  for (const role of PERMISSION_ROLES) {
    for (const cap of PERMISSION_CAPABILITIES) {
      next[role][cap] = Boolean(matrix[role]?.[cap]);
    }
  }
  return next;
}

export function matrixFromRows(
  rows: { role?: string; capability?: string; allowed?: boolean }[]
): RolePermissionMatrix {
  const next = cloneRoleMatrix(DEFAULT_ROLE_MATRIX);
  for (const row of rows) {
    const role = row.role as UserRole;
    const cap = row.capability as PermissionCapability;
    if (!PERMISSION_ROLES.includes(role) || !PERMISSION_CAPABILITIES.includes(cap)) continue;
    next[role][cap] = Boolean(row.allowed);
  }
  return next;
}

export function matrixToRows(
  matrix: RolePermissionMatrix
): { role: UserRole; capability: PermissionCapability; allowed: boolean }[] {
  const rows: { role: UserRole; capability: PermissionCapability; allowed: boolean }[] = [];
  for (const role of PERMISSION_ROLES) {
    for (const cap of PERMISSION_CAPABILITIES) {
      rows.push({ role, capability: cap, allowed: Boolean(matrix[role][cap]) });
    }
  }
  return rows;
}

export interface PermissionActor {
  role?: string | null;
  isSuperadmin?: boolean;
  isGuest?: boolean;
}

let currentMatrix: RolePermissionMatrix = cloneRoleMatrix(DEFAULT_ROLE_MATRIX);

export function getRolePermissionMatrix(): RolePermissionMatrix {
  return currentMatrix;
}

export function setRolePermissionMatrix(matrix: RolePermissionMatrix): void {
  currentMatrix = cloneRoleMatrix(matrix);
}

export function resetRolePermissionMatrix(): void {
  currentMatrix = cloneRoleMatrix(DEFAULT_ROLE_MATRIX);
}

export function actorHasCapability(
  actor: PermissionActor,
  capability: PermissionCapability,
  matrix: RolePermissionMatrix = currentMatrix
): boolean {
  if (actor.isSuperadmin) return true;
  if (actor.isGuest && GUEST_DENIED_CAPABILITIES.includes(capability)) return false;
  const role = actor.role as UserRole;
  if (!role || !PERMISSION_ROLES.includes(role)) return false;
  return Boolean(matrix[role]?.[capability]);
}

export function canWriteBugs(
  role?: UserRole | string | null,
  isSuperadmin?: boolean,
  isGuest?: boolean
): boolean {
  return actorHasCapability({ role, isSuperadmin, isGuest }, "write_cards");
}

export function canAssignBugs(
  role?: UserRole | string | null,
  isSuperadmin?: boolean,
  isGuest?: boolean
): boolean {
  return actorHasCapability({ role, isSuperadmin, isGuest }, "assign_cards");
}

export function canArchiveBugs(
  role?: UserRole | string | null,
  isSuperadmin?: boolean,
  isGuest?: boolean
): boolean {
  return actorHasCapability({ role, isSuperadmin, isGuest }, "archive_cards");
}

export function canUseAi(
  role?: UserRole | string | null,
  isSuperadmin?: boolean,
  isGuest?: boolean
): boolean {
  return actorHasCapability({ role, isSuperadmin, isGuest }, "use_ai");
}

export function canManageSpaces(
  role?: UserRole | string | null,
  isSuperadmin?: boolean,
  isGuest?: boolean
): boolean {
  return actorHasCapability({ role, isSuperadmin, isGuest }, "manage_spaces");
}

export function canInviteToRoom(
  role?: UserRole | string | null,
  isSuperadmin?: boolean,
  isGuest?: boolean
): boolean {
  return actorHasCapability({ role, isSuperadmin, isGuest }, "invite_members");
}

export function canManageUsers(
  role?: UserRole | string | null,
  isSuperadmin?: boolean,
  isGuest?: boolean
): boolean {
  return actorHasCapability({ role, isSuperadmin, isGuest }, "manage_users");
}

export function canManageViews(
  role?: UserRole | string | null,
  isSuperadmin?: boolean,
  isGuest?: boolean
): boolean {
  return actorHasCapability({ role, isSuperadmin, isGuest }, "manage_views");
}

export function canManageIntegrations(
  role?: UserRole | string | null,
  isSuperadmin?: boolean,
  isGuest?: boolean
): boolean {
  return actorHasCapability({ role, isSuperadmin, isGuest }, "manage_integrations");
}

export function canManageOrganizations(isSuperadmin?: boolean): boolean {
  return Boolean(isSuperadmin);
}

/** Promover a admin continua estrutural: só admin da org ou superadmin. */
export function canGrantAdminRole(
  role?: UserRole | string | null,
  isSuperadmin?: boolean
): boolean {
  return Boolean(isSuperadmin) || role === "admin";
}
