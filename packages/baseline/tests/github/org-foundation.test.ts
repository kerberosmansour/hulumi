// BDD scenarios for @hulumi/baseline.github.OrgFoundation. Each describe
// block corresponds to one row of the BDD Acceptance Scenarios table in
// docs/slo/runbook-milestones/hulumi-github-m2.md.
//
// Critical contracts (per critique decisions applied during /slo-execute M1
// + M2):
//   - OIDC default is the three-axis safe shape; snapshot-pinned (S2 critique).
//   - Wildcard custom OIDC template rejected at runtime (UNC6426 mitigation).
//   - SHA-pin policy on by default at startup-hardened.
//   - Backend swap (flat-fields ↔ CSC) preserves all `appliedFlags`.
//   - `dependsOn` ordering on backend swap prevents destroy-before-create
//     gap (S3 critique).
//   - Audit-event emitter strips token-fragment regex matches (S2 critique).
//   - `hulumi:controls` tag remains DELIBERATELY OMITTED in M2 — M3 adds it.

import { describe, it, expect, beforeEach } from "vitest";

import { OrgFoundation } from "../../src/github/org-foundation";
import {
  registrations,
  resetRegistrations,
  valueOf,
  settlePulumi,
} from "../setup";

type Registration = (typeof registrations)[number];

const SANDBOX_ORG = "sandbox-org";
const TEST_BILLING = "billing@example.invalid";

function find(type: string): Registration | undefined {
  return registrations.find((r) => r.type === type);
}

function findAll(type: string): Registration[] {
  return registrations.filter((r) => r.type === type);
}

describe("OrgFoundation — startup-hardened tier with default flat-fields backend (happy path)", () => {
  beforeEach(resetRegistrations);

  it("provisions ruleset + Actions allowlist + OIDC template + OrganizationSettings with hardened defaults", async () => {
    const f = new OrgFoundation("org-hard", {
      tier: "startup-hardened",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
    });
    await valueOf(f.organizationRulesetId);
    await settlePulumi();

    const ruleset = find("github:index/organizationRuleset:OrganizationRuleset");
    expect(ruleset).toBeDefined();
    const rules = ruleset!.inputs.rules as Record<string, unknown>;
    // Startup-hardened ruleset includes signed-commits + non-fast-forward + deletion.
    expect(rules.requiredSignatures).toBe(true);
    expect(rules.nonFastForward).toBe(true);
    expect(rules.deletion).toBe(true);

    const perms = find("github:index/actionsOrganizationPermissions:ActionsOrganizationPermissions");
    expect(perms).toBeDefined();
    expect(perms!.inputs.allowedActions).toBe("selected");
    expect(perms!.inputs.shaPinningRequired).toBe(true);

    const oidc = find(
      "github:index/actionsOrganizationOidcSubjectClaimCustomizationTemplate:ActionsOrganizationOidcSubjectClaimCustomizationTemplate",
    );
    expect(oidc).toBeDefined();
    const claimKeys = oidc!.inputs.includeClaimKeys as readonly string[];
    expect(claimKeys).toEqual(["repo", "context", "job_workflow_ref", "environment"]);

    const settings = find("github:index/organizationSettings:OrganizationSettings");
    expect(settings).toBeDefined();
    expect(settings!.inputs.advancedSecurityEnabledForNewRepositories).toBe(true);
    expect(settings!.inputs.dependabotAlertsEnabledForNewRepositories).toBe(true);
    expect(settings!.inputs.dependabotSecurityUpdatesEnabledForNewRepositories).toBe(true);
    expect(settings!.inputs.dependencyGraphEnabledForNewRepositories).toBe(true);
    expect(settings!.inputs.secretScanningEnabledForNewRepositories).toBe(true);
    expect(settings!.inputs.secretScanningPushProtectionEnabledForNewRepositories).toBe(true);

    // CSC backend NOT registered when flat-fields is selected (default).
    expect(findAll("hulumi:baseline:github:CodeSecurityConfiguration")).toEqual([]);
  });
});

describe("OrgFoundation — startup-hardened tier with code-security-configurations backend (happy path)", () => {
  beforeEach(resetRegistrations);

  it("registers a pulumi.dynamic.Resource for CSC instead of OrganizationSettings", async () => {
    const f = new OrgFoundation("org-csc", {
      tier: "startup-hardened",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
      organizationSecurityBackend: "code-security-configurations",
    });
    await valueOf(f.organizationRulesetId);
    await settlePulumi();

    // Dynamic-resource ID is registered as a custom resource type.
    const csc = registrations.find((r) =>
      r.type.includes("CodeSecurityConfiguration"),
    );
    expect(csc).toBeDefined();

    // The flat-fields OrganizationSettings is NOT registered when CSC backend selected.
    expect(find("github:index/organizationSettings:OrganizationSettings")).toBeUndefined();
  });
});

describe("OrgFoundation — Sandbox tier minimum (empty state)", () => {
  beforeEach(resetRegistrations);

  it("emits ruleset with deletion + force-push only; Actions local-only; SHA-pin off; no OrgSettings", async () => {
    const f = new OrgFoundation("org-sb", {
      tier: "sandbox",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
    });
    await valueOf(f.organizationRulesetId);
    await settlePulumi();

    const ruleset = find("github:index/organizationRuleset:OrganizationRuleset");
    expect(ruleset).toBeDefined();
    const rules = ruleset!.inputs.rules as Record<string, unknown>;
    expect(rules.deletion).toBe(true);
    expect(rules.nonFastForward).toBe(true);
    // Sandbox does NOT require signed commits.
    expect(rules.requiredSignatures).toBeUndefined();

    const perms = find("github:index/actionsOrganizationPermissions:ActionsOrganizationPermissions");
    expect(perms).toBeDefined();
    expect(perms!.inputs.allowedActions).toBe("local_only");
    expect(perms!.inputs.shaPinningRequired).toBe(false);

    // Sandbox tier is opt-in for security-defaults; no OrganizationSettings registered.
    expect(find("github:index/organizationSettings:OrganizationSettings")).toBeUndefined();
  });
});

describe("OrgFoundation — invalid tier (invalid input)", () => {
  beforeEach(resetRegistrations);

  it("throws Error with documented message", () => {
    expect(() => {
      new OrgFoundation("org-bad", {
        tier: "production" as unknown as "sandbox",
        organization: SANDBOX_ORG,
        billingEmail: TEST_BILLING,
      });
    }).toThrow(/Invalid Hulumi tier "production"/);
  });
});

describe("OrgFoundation — invalid Actions allowlist patterns (invalid input)", () => {
  beforeEach(resetRegistrations);

  it("rejects patterns containing shell metacharacters", () => {
    expect(() => {
      new OrgFoundation("org-bad-allow", {
        tier: "startup-hardened",
        organization: SANDBOX_ORG,
        billingEmail: TEST_BILLING,
        actionsAllowlist: {
          allowedActions: "selected",
          selectedActionsPatterns: ["actions/checkout@*; rm -rf /"],
        },
      });
    }).toThrow(/Actions allowlist pattern .* invalid character|GitHub allowlist syntax/);
  });
});

describe("OrgFoundation — abuse case: default OIDC template is the three-axis safe shape", () => {
  beforeEach(resetRegistrations);

  // tm-hulumi-github-abuse-oidc-default-safe (snapshot-pinned).
  it("default includeClaimKeys is exactly ['repo', 'context', 'job_workflow_ref', 'environment']", async () => {
    const f = new OrgFoundation("org-default-oidc", {
      tier: "startup-hardened",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
    });
    await valueOf(f.organizationRulesetId);
    await settlePulumi();

    const oidc = find(
      "github:index/actionsOrganizationOidcSubjectClaimCustomizationTemplate:ActionsOrganizationOidcSubjectClaimCustomizationTemplate",
    );
    expect(oidc).toBeDefined();
    const claimKeys = oidc!.inputs.includeClaimKeys as readonly string[];
    // Snapshot-pinned: any future change to this default fails this test
    // until the snapshot is regenerated with explicit reviewer approval.
    expect(claimKeys).toStrictEqual([
      "repo",
      "context",
      "job_workflow_ref",
      "environment",
    ]);
  });
});

describe("OrgFoundation — abuse case: custom OIDC template containing wildcard rejected at runtime", () => {
  beforeEach(resetRegistrations);

  // tm-hulumi-github-abuse-oidc-wildcard-rejected.
  it("rejects '*' in customTemplate axes with error message naming UNC6426", () => {
    expect(() => {
      new OrgFoundation("org-wild-oidc", {
        tier: "startup-hardened",
        organization: SANDBOX_ORG,
        billingEmail: TEST_BILLING,
        oidcSubTemplate: { useDefault: false, customTemplate: ["repo", "*"] },
      });
    }).toThrow(/wildcard|UNC6426|sub-claim/i);
  });

  it("rejects empty axis string", () => {
    expect(() => {
      new OrgFoundation("org-empty-oidc", {
        tier: "startup-hardened",
        organization: SANDBOX_ORG,
        billingEmail: TEST_BILLING,
        oidcSubTemplate: { useDefault: false, customTemplate: ["repo", ""] },
      });
    }).toThrow(/empty|sub-claim/i);
  });
});

describe("OrgFoundation — abuse case: SHA-pin default on at startup-hardened", () => {
  beforeEach(resetRegistrations);

  // tm-hulumi-github-abuse-sha-pin-default.
  it("ActionsOrganizationPermissions has shaPinningRequired: true at startup-hardened by default", async () => {
    const f = new OrgFoundation("org-shapin-default", {
      tier: "startup-hardened",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
    });
    await valueOf(f.organizationRulesetId);
    await settlePulumi();

    const perms = find("github:index/actionsOrganizationPermissions:ActionsOrganizationPermissions");
    expect(perms).toBeDefined();
    expect(perms!.inputs.shaPinningRequired).toBe(true);
  });
});

describe("OrgFoundation — abuse case: backend swap preserves all securityDefaults flags", () => {
  beforeEach(resetRegistrations);

  // tm-hulumi-github-abuse-csc-backend-no-data-loss.
  it("two OrgFoundation instances with identical securityDefaults but different backend produce identical appliedFlags", async () => {
    const flat = new OrgFoundation("org-flat", {
      tier: "startup-hardened",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
      organizationSecurityBackend: "flat-fields",
    });
    resetRegistrations();
    const csc = new OrgFoundation("org-csc-2", {
      tier: "startup-hardened",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
      organizationSecurityBackend: "code-security-configurations",
    });
    const flatFlags = await valueOf(flat.securityDefaults);
    const cscFlags = await valueOf(csc.securityDefaults);

    expect(flatFlags.appliedFlags).toStrictEqual(cscFlags.appliedFlags);
    // Backend reported in output reflects the actual choice.
    expect(flatFlags.backend).toBe("flat-fields");
    expect(cscFlags.backend).toBe("code-security-configurations");
  });
});

describe("OrgFoundation — abuse case: audit-event emitter redacts token fragments", () => {
  beforeEach(resetRegistrations);

  // tm-hulumi-github-abuse-token-redaction-in-audit (per critique S2).
  it("redaction layer strips ghs_*/ghp_*/Bearer tokens from event detail strings", async () => {
    const { redactTokens } = await import("../../src/github/org-security-defaults");
    expect(redactTokens('{"auth":"Bearer ghs_xxxxxxxxxxxxxxxx","other":"safe"}')).not.toMatch(
      /ghs_xxxxxxxxxxxxxxxx/,
    );
    expect(redactTokens("Bearer ghs_abc Bearer github_pat_def")).not.toMatch(/ghs_abc|github_pat_def/);
    expect(redactTokens("safe text without tokens")).toBe("safe text without tokens");
  });
});

describe("OrgFoundation — schema lock (compatibility)", () => {
  beforeEach(resetRegistrations);

  it("[component type string] is the documented stable identifier", async () => {
    const { ORG_FOUNDATION_COMPONENT_TYPE } = await import("../../src/github/org-foundation");
    expect(ORG_FOUNDATION_COMPONENT_TYPE).toBe("hulumi:baseline:github:OrgFoundation");
  });

  it("[securityDefaults output shape] is backend-opaque (same key set across backends)", async () => {
    const flat = new OrgFoundation("org-flat-shape", {
      tier: "startup-hardened",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
      organizationSecurityBackend: "flat-fields",
    });
    resetRegistrations();
    const csc = new OrgFoundation("org-csc-shape", {
      tier: "startup-hardened",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
      organizationSecurityBackend: "code-security-configurations",
    });
    const f1 = await valueOf(flat.securityDefaults);
    const f2 = await valueOf(csc.securityDefaults);
    expect(Object.keys(f1.appliedFlags).sort()).toEqual(Object.keys(f2.appliedFlags).sort());
  });

  it("[hulumi:controls tag added in M3] — staged-migration completed", async () => {
    const f = new OrgFoundation("org-controls", {
      tier: "startup-hardened",
      organization: SANDBOX_ORG,
      billingEmail: TEST_BILLING,
    });
    await valueOf(f.organizationRulesetId);
    await settlePulumi();

    // M3 adds `hulumiControls` as a top-level Output on OrgFoundation,
    // sourced from the union of cisGithub + nistSsdfV11 mapping tables.
    const controls = await valueOf(f.hulumiControls);
    expect(controls.length).toBeGreaterThan(0);
    expect(controls).toContain("CIS-GitHub-v1.2.0:PENDING-WORKBENCH");
    expect(controls.some((c) => c.startsWith("NIST-SSDF-v1.1:"))).toBe(true);
  });
});
