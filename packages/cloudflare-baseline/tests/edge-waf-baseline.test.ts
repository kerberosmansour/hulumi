import { afterEach, describe, expect, it } from "vitest";

import { EdgeWafBaseline, loginRateLimitRule, validatedRulesetExpression } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

function rulesets(): Record<string, unknown>[] {
  return registrations
    .filter((r) => r.type === "cloudflare:index/ruleset:Ruleset")
    .map((r) => r.inputs);
}

describe("EdgeWafBaseline", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("registers managed WAF rulesets where the declared plan supports them", async () => {
    const waf = new EdgeWafBaseline("edge", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      plan: "business",
      enableManagedRulesets: true,
    });

    await settlePulumi();

    const managed = rulesets().find((ruleset) => ruleset.phase === "http_request_firewall_managed");
    expect(managed).toMatchObject({
      zoneId: "zone_123",
      kind: "zone",
      rules: expect.arrayContaining([
        expect.objectContaining({
          action: "execute",
          actionParameters: expect.objectContaining({ id: expect.any(String) }),
        }),
      ]),
    });
    await expect(valueOf(waf.appliedControls)).resolves.toEqual(
      expect.arrayContaining(["managed_ruleset_cloudflare", "managed_ruleset_owasp_core"]),
    );
    await expect(valueOf(waf.unsupportedControls)).resolves.toEqual([]);
  });

  it("records managed WAF as unsupported on lower plans while applying supported fallbacks", async () => {
    const waf = new EdgeWafBaseline("edge-free", {
      tier: "sandbox",
      zoneId: "zone_123",
      plan: "free",
      enableManagedRulesets: true,
      customRules: [
        {
          name: "block-staging-probe",
          action: "block",
          expression: validatedRulesetExpression('http.request.uri.path contains "/staging"'),
        },
      ],
    });

    await settlePulumi();

    expect(rulesets().some((ruleset) => ruleset.phase === "http_request_firewall_managed")).toBe(
      false,
    );
    expect(rulesets()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          phase: "http_request_firewall_custom",
          rules: expect.arrayContaining([expect.objectContaining({ action: "block" })]),
        }),
      ]),
    );
    await expect(valueOf(waf.appliedControls)).resolves.toContain("custom_waf_rules");
    await expect(valueOf(waf.unsupportedControls)).resolves.toEqual(
      expect.arrayContaining(["managed_ruleset_cloudflare", "managed_ruleset_owasp_core"]),
    );
  });

  it("turns the login helper into a bounded rate-limit ruleset", async () => {
    new EdgeWafBaseline("edge-rate", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      plan: "business",
      rateLimitRules: [
        loginRateLimitRule({
          pathPrefix: "/login",
          requestsPerPeriod: 5,
          periodSeconds: 60,
        }),
      ],
    });

    await settlePulumi();

    const rateLimit = rulesets().find((ruleset) => ruleset.phase === "http_ratelimit");
    expect(rateLimit).toMatchObject({
      rules: [
        expect.objectContaining({
          expression: expect.stringContaining("/login"),
          ratelimit: expect.objectContaining({
            requestsPerPeriod: 5,
            period: 60,
            characteristics: ["ip.src"],
          }),
        }),
      ],
    });
  });

  it("rejects more than the hard cap of custom WAF rules before child resources register", () => {
    expect(() => {
      new EdgeWafBaseline("too-many", {
        tier: "startup-hardened",
        zoneId: "zone_123",
        plan: "enterprise",
        customRules: Array.from({ length: 21 }, (_, index) => ({
          name: `custom-${index}`,
          action: "block",
          expression: validatedRulesetExpression(`http.request.uri.path contains "/${index}"`),
        })),
      });
    }).toThrow(/maximum of 20 custom WAF rules/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });
});
