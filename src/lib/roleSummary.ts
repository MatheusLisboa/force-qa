import {
  PERMISSION_CAPABILITIES,
  PERMISSION_CAPABILITY_META,
  PERMISSION_ROLES,
  type PermissionCapability,
  type RolePermissionMatrix,
} from "./permissions";
import { formatRoleLabel } from "./format";
import type { UserRole } from "../types";

/** Grupos de papéis que têm EXATAMENTE as mesmas permissões (o cargo é só um rótulo). Ignora o admin. */
export function groupEquivalentRoles(matrix: RolePermissionMatrix): UserRole[][] {
  const byKey = new Map<string, UserRole[]>();
  for (const role of PERMISSION_ROLES) {
    if (role === "admin") continue;
    const key = PERMISSION_CAPABILITIES.map((cap) => (matrix[role]?.[cap] ? "1" : "0")).join("");
    byKey.set(key, [...(byKey.get(key) ?? []), role]);
  }
  return [...byKey.values()].filter((group) => group.length > 1);
}

export interface MatrixChange {
  role: UserRole;
  capability: PermissionCapability;
  from: boolean;
  to: boolean;
}

export function diffMatrix(saved: RolePermissionMatrix, draft: RolePermissionMatrix): MatrixChange[] {
  const changes: MatrixChange[] = [];
  for (const role of PERMISSION_ROLES) {
    for (const capability of PERMISSION_CAPABILITIES) {
      const from = Boolean(saved[role]?.[capability]);
      const to = Boolean(draft[role]?.[capability]);
      if (from !== to) changes.push({ role, capability, from, to });
    }
  }
  return changes;
}

export function describeMatrixChange(change: MatrixChange): string {
  const role = formatRoleLabel(change.role);
  const label = PERMISSION_CAPABILITY_META[change.capability].label;
  return change.to ? `${role} passa a poder: ${label}` : `${role} deixa de poder: ${label}`;
}

export function summarizeRole(matrix: RolePermissionMatrix, role: UserRole): { can: string[]; cannot: string[] } {
  const can: string[] = [];
  const cannot: string[] = [];
  for (const capability of PERMISSION_CAPABILITIES) {
    (matrix[role]?.[capability] ? can : cannot).push(PERMISSION_CAPABILITY_META[capability].label);
  }
  return { can, cannot };
}
