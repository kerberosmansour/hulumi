import { afterEach, describe, expect, it } from "vitest";

import { ProtectedAdminHostname } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

function registrationInputs(type: string): Record<string, unknown> | undefined {
  return registrations.find((r) => r.type === type)?.inputs;
}

function containsKey(value: unknown, key: string): boolean {
  if (Array.isArray(value)) return value.some((item) => containsKey(item, key));
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(record, key) ||
    Object.values(record).some((item) => containsKey(item, key))
  );
}

describe("ProtectedAdminHostname", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("denies protected admin hostnames without an identity allow-list", () => {
    expect(() => {
      new ProtectedAdminHostname("admin", {
        tier: "startup-hardened",
        zoneId: "zone_123",
        hostname: "admin.example.com",
      });
    }).toThrow(/allow-list policy/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });

  it("rejects malformed identity selectors before creating provider resources", () => {
    expect(() => {
      new ProtectedAdminHostname("admin", {
        tier: "startup-hardened",
        zoneId: "zone_123",
        hostname: "admin.example.com",
        allowedEmails: [`ops@!@!.${"!.test.".repeat(100)}invalid`],
      });
    }).toThrow(/allowedEmails/);

    expect(() => {
      new ProtectedAdminHostname("admin-domain", {
        tier: "startup-hardened",
        zoneId: "zone_123",
        hostname: "admin.example.com",
        allowedEmailDomains: ["example..com"],
      });
    }).toThrow(/allowedEmailDomains/);

    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });

  it("registers an Access application and allow policy for admin hostnames", async () => {
    const admin = new ProtectedAdminHostname("admin", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      accountId: "acct_123",
      hostname: "admin.example.com",
      allowedEmails: ["admin@example.com"],
      sessionDuration: "8h",
      purposeJustificationRequired: true,
    });

    await settlePulumi();

    expect(
      registrationInputs("cloudflare:index/zeroTrustAccessApplication:ZeroTrustAccessApplication"),
    ).toMatchObject({
      zoneId: "zone_123",
      domain: "admin.example.com",
      type: "self_hosted",
      httpOnlyCookieAttribute: true,
      sameSiteCookieAttribute: "strict",
      policies: [
        expect.objectContaining({
          decision: "allow",
          includes: [{ email: { email: "admin@example.com" } }],
        }),
      ],
    });
    expect(
      registrationInputs("cloudflare:index/zeroTrustAccessPolicy:ZeroTrustAccessPolicy"),
    ).toMatchObject({
      accountId: "acct_123",
      decision: "allow",
      includes: [{ email: { email: "admin@example.com" } }],
    });
    await expect(valueOf(admin.appliedControls)).resolves.toEqual(
      expect.arrayContaining(["access_application", "access_allow_policy"]),
    );
    await expect(valueOf(admin.requiredIdentitySelectors)).resolves.toEqual([
      "email:admin@example.com",
    ]);
  });

  it("refuses identity-provider routing without an independent authorization allow-list", () => {
    expect(() => {
      new ProtectedAdminHostname("admin", {
        tier: "startup-hardened",
        zoneId: "zone_123",
        hostname: "admin.example.com",
        allowedIdentityProviderIds: ["idp_123"],
      });
    }).toThrow(/authorization allow-list|email.*domain.*group/i);

    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });

  it("uses identity providers only for application login routing", async () => {
    const admin = new ProtectedAdminHostname("admin", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      accountId: "acct_123",
      hostname: "admin.example.com",
      allowedEmails: ["admin@example.com"],
      allowedIdentityProviderIds: ["idp_primary", "idp_breakglass"],
    });

    await settlePulumi();

    const application = registrationInputs(
      "cloudflare:index/zeroTrustAccessApplication:ZeroTrustAccessApplication",
    );
    const reusablePolicy = registrationInputs(
      "cloudflare:index/zeroTrustAccessPolicy:ZeroTrustAccessPolicy",
    );
    expect(application).toMatchObject({
      allowedIdps: ["idp_primary", "idp_breakglass"],
      policies: [
        expect.objectContaining({
          includes: [{ email: { email: "admin@example.com" } }],
        }),
      ],
    });
    expect(reusablePolicy).toMatchObject({
      includes: [{ email: { email: "admin@example.com" } }],
    });
    expect(containsKey(application?.policies, "loginMethod")).toBe(false);
    expect(containsKey(reusablePolicy?.includes, "loginMethod")).toBe(false);
    await expect(valueOf(admin.requiredIdentitySelectors)).resolves.toEqual([
      "email:admin@example.com",
    ]);
  });

  it("keeps an Access group as the sole authorization selector when an IdP is selected", async () => {
    const admin = new ProtectedAdminHostname("admin", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      hostname: "admin.example.com",
      allowedAccessGroupIds: ["group_admins"],
      allowedIdentityProviderIds: ["idp_primary"],
    });

    await settlePulumi();

    const application = registrationInputs(
      "cloudflare:index/zeroTrustAccessApplication:ZeroTrustAccessApplication",
    );
    expect(application).toMatchObject({
      allowedIdps: ["idp_primary"],
      policies: [expect.objectContaining({ includes: [{ group: { id: "group_admins" } }] })],
    });
    expect(containsKey(application?.policies, "loginMethod")).toBe(false);
    await expect(valueOf(admin.requiredIdentitySelectors)).resolves.toEqual([
      "access_group:group_admins",
    ]);
  });

  it("preserves the email, domain, and Access-group authorization union", async () => {
    const admin = new ProtectedAdminHostname("admin", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      hostname: "admin.example.com",
      allowedEmails: ["admin@example.com"],
      allowedEmailDomains: ["example.org"],
      allowedAccessGroupIds: ["group_admins"],
    });

    await settlePulumi();

    const application = registrationInputs(
      "cloudflare:index/zeroTrustAccessApplication:ZeroTrustAccessApplication",
    );
    expect(application).toMatchObject({
      policies: [
        expect.objectContaining({
          includes: [
            { email: { email: "admin@example.com" } },
            { emailDomain: { domain: "example.org" } },
            { group: { id: "group_admins" } },
          ],
        }),
      ],
    });
    await expect(valueOf(admin.requiredIdentitySelectors)).resolves.toEqual([
      "email:admin@example.com",
      "email_domain:example.org",
      "access_group:group_admins",
    ]);
  });
});
