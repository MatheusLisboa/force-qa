/** Org seedada em supabase/migration_organizations.sql. Uma só até existir o segundo tenant. */
export const DEFAULT_ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
export const DEFAULT_ORGANIZATION_SLUG = "default";

export function resolveOrganizationId(value?: string | null): string {
  const trimmed = (value || "").trim();
  return trimmed || DEFAULT_ORGANIZATION_ID;
}

export function sameOrganization(
  left?: string | null,
  right?: string | null
): boolean {
  return resolveOrganizationId(left) === resolveOrganizationId(right);
}

export function belongsToOrganization(
  itemOrgId: string | undefined,
  organizationId: string | undefined,
  isSuperadmin?: boolean
): boolean {
  if (isSuperadmin) return true;
  if (!organizationId) return false;
  return sameOrganization(itemOrgId, organizationId);
}
