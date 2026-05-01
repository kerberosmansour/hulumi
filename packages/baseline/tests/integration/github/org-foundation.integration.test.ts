// Integration test for @hulumi/baseline.github.OrgFoundation.
// Gated on HULUMI_INTEGRATION=1 + HULUMI_GITHUB_SANDBOX_ORG + the GitHub
// App auth env vars. Skips cleanly when any of those are unset.
//
// Two describe blocks cover the two backends per the M2 BDD contract.
// Each provisioned artifact carries a `hulumi-github-m2-` prefix so the
// `afterAll` teardown can sweep up by prefix.

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { LocalWorkspace, type Stack } from "@pulumi/pulumi/automation";
import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

import { OrgFoundation } from "../../../src/github/org-foundation";

const INTEGRATION = process.env.HULUMI_INTEGRATION === "1";
const SANDBOX_ORG = process.env.HULUMI_GITHUB_SANDBOX_ORG;
const APP_ID = process.env.HULUMI_GITHUB_APP_ID;
const APP_INSTALLATION_ID = process.env.HULUMI_GITHUB_APP_INSTALLATION_ID;
const APP_PEM = process.env.HULUMI_GITHUB_APP_PEM;
const BILLING_EMAIL = process.env.HULUMI_GITHUB_SANDBOX_BILLING_EMAIL;

const TEST_PREFIX = "hulumi-github-m2-";
const TEST_ID = `${TEST_PREFIX}${Date.now().toString(36)}`;

const ENABLED =
  INTEGRATION && SANDBOX_ORG && APP_ID && APP_INSTALLATION_ID && APP_PEM && BILLING_EMAIL;

const reason = !INTEGRATION
  ? "HULUMI_INTEGRATION!=1 — set to 1 to opt into integration suites"
  : !SANDBOX_ORG
    ? "HULUMI_GITHUB_SANDBOX_ORG unset — no target sandbox org"
    : !BILLING_EMAIL
      ? "HULUMI_GITHUB_SANDBOX_BILLING_EMAIL unset — required by OrganizationSettings"
      : "HULUMI_GITHUB_APP_* env vars unset — see docs/cookbooks for sandbox provisioning";

describe.skipIf(!ENABLED)("OrgFoundation integration — flat-fields backend", () => {
  let stack: Stack;

  beforeAll(async () => {
    if (!ENABLED) return;
    stack = await LocalWorkspace.createOrSelectStack({
      stackName: `org-foundation-flat-${TEST_ID}`,
      projectName: "hulumi-github-m2",
      program: async () => {
        const provider = new github.Provider("sandbox-provider", {
          owner: SANDBOX_ORG!,
          appAuth: { id: APP_ID!, installationId: APP_INSTALLATION_ID!, pemFile: APP_PEM! },
        });
        const f = new OrgFoundation(`${TEST_ID}-flat`, {
          tier: "startup-hardened",
          organization: SANDBOX_ORG!,
          billingEmail: BILLING_EMAIL!,
          organizationSecurityBackend: "flat-fields",
          provider,
        });
        return {
          rulesetId: f.organizationRulesetId,
          oidcId: f.oidcTemplateId,
          securityDefaults: f.securityDefaults,
        };
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (!ENABLED || stack === undefined) return;
    try {
      await stack.destroy({ onOutput: () => undefined });
    } catch (err) {
      console.error(`[m2-integration-flat] destroy failed: ${String(err)}`);
    }
    try {
      await stack.workspace.removeStack(stack.name);
    } catch (err) {
      console.error(`[m2-integration-flat] removeStack failed: ${String(err)}`);
    }
  }, 120_000);

  it("provisions org-level ruleset + OIDC template + flat-fields settings against real sandbox org", async () => {
    const up = await stack.up({ onOutput: () => undefined });
    expect(up.summary.result).toBe("succeeded");
    const sd = up.outputs.securityDefaults?.value as {
      backend?: string;
      appliedFlags?: Record<string, boolean>;
    };
    expect(sd.backend).toBe("flat-fields");
    expect(Object.keys(sd.appliedFlags ?? {}).length).toBeGreaterThan(0);
  }, 240_000);
});

describe.skipIf(!ENABLED)(
  "OrgFoundation integration — code-security-configurations backend",
  () => {
    let stack: Stack;

    beforeAll(async () => {
      if (!ENABLED) return;
      stack = await LocalWorkspace.createOrSelectStack({
        stackName: `org-foundation-csc-${TEST_ID}`,
        projectName: "hulumi-github-m2",
        program: async () => {
          const provider = new github.Provider("sandbox-provider", {
            owner: SANDBOX_ORG!,
            appAuth: { id: APP_ID!, installationId: APP_INSTALLATION_ID!, pemFile: APP_PEM! },
          });
          const f = new OrgFoundation(`${TEST_ID}-csc`, {
            tier: "startup-hardened",
            organization: SANDBOX_ORG!,
            billingEmail: BILLING_EMAIL!,
            organizationSecurityBackend: "code-security-configurations",
            provider,
          });
          return {
            rulesetId: f.organizationRulesetId,
            securityDefaults: f.securityDefaults,
          };
        },
      });
    }, 60_000);

    afterAll(async () => {
      if (!ENABLED || stack === undefined) return;
      try {
        await stack.destroy({ onOutput: () => undefined });
      } catch (err) {
        console.error(`[m2-integration-csc] destroy failed: ${String(err)}`);
      }
      try {
        await stack.workspace.removeStack(stack.name);
      } catch (err) {
        console.error(`[m2-integration-csc] removeStack failed: ${String(err)}`);
      }
    }, 120_000);

    it("registers CSC placeholder resource (REST integration deferred to v1.1 D1.5)", async () => {
      const up = await stack.up({ onOutput: () => undefined });
      expect(up.summary.result).toBe("succeeded");
      const sd = up.outputs.securityDefaults?.value as { backend?: string };
      expect(sd.backend).toBe("code-security-configurations");
    }, 240_000);
  },
);

if (!ENABLED) {
  describe("OrgFoundation integration — gated skip notice", () => {
    it.skip(`integration suite skipped (${reason})`, () => {
      // intentionally empty
    });
  });
}

void pulumi;
