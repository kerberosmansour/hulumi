import { afterEach, describe, expect, it } from "vitest";

import { ProtectedAdminHostname } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

function registrationInputs(type: string): Record<string, unknown> | undefined {
  return registrations.find((r) => r.type === type)?.inputs;
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
});
