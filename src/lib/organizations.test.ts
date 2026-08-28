import { describe, expect, it } from "vitest";
import { DEFAULT_ORGANIZATION_ID, belongsToOrganization, isValidOrganizationSlug, resolveOrganizationId, slugifyOrganizationName } from "./organizations";

describe("resolveOrganizationId", () => {
  it("keeps a real org id", () => {
    expect(resolveOrganizationId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
  });

  it("falls back to the default org", () => {
    expect(resolveOrganizationId("")).toBe(DEFAULT_ORGANIZATION_ID);
    expect(resolveOrganizationId(null)).toBe(DEFAULT_ORGANIZATION_ID);
    expect(resolveOrganizationId(undefined)).toBe(DEFAULT_ORGANIZATION_ID);
  });
});

describe("belongsToOrganization", () => {
  it("matches the same org and lets superadmin through", () => {
    expect(belongsToOrganization(DEFAULT_ORGANIZATION_ID, DEFAULT_ORGANIZATION_ID)).toBe(true);
    expect(belongsToOrganization("other", DEFAULT_ORGANIZATION_ID)).toBe(false);
    expect(belongsToOrganization("other", DEFAULT_ORGANIZATION_ID, true)).toBe(true);
  });
});

describe("slugifyOrganizationName", () => {
  it("slugifies names and validates the result", () => {
    expect(slugifyOrganizationName("Acme QA")).toBe("acme-qa");
    expect(slugifyOrganizationName("  São Paulo  ")).toBe("sao-paulo");
    expect(isValidOrganizationSlug("acme-qa")).toBe(true);
    expect(isValidOrganizationSlug("Acme")).toBe(false);
    expect(isValidOrganizationSlug("")).toBe(false);
  });
});
