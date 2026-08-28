/** Org seedada em supabase/migration_organizations.sql. */
export const DEFAULT_ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";
export const DEFAULT_ORGANIZATION_SLUG = "default";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveOrganizationId(value?: string | null): string {
  const trimmed = (value || "").trim();
  return trimmed || DEFAULT_ORGANIZATION_ID;
}

export function isOrganizationId(value?: string | null): boolean {
  return UUID_RE.test((value || "").trim());
}

export function slugifyOrganizationName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isValidOrganizationSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 80;
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
