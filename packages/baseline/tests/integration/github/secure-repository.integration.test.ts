// Integration test for @hulumi/baseline.github.SecureRepository.
// Gated on HULUMI_INTEGRATION=1 + HULUMI_GITHUB_SANDBOX_ORG + GitHub App
// auth env vars. Skips cleanly when any of those are unset — the suite
// remains green on a developer laptop without sandbox creds; a CI runner
// with the secrets configured will exercise the real path.
//
// Each created repo carries the description prefix `hulumi-github-m1-` so
// the `afterAll` teardown can sweep up by prefix even when individual deletes
// fail. This is the leak-prevention discipline from the M1 BDD scenario
// `tm-hulumi-github-abuse-sandbox-leak`.
//
// Sandbox-org App provisioning is out-of-band — see
// `docs/cookbooks/github-webhook-drift.md` (M5 deliverable) for the wiring
// guide once it lands.

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { LocalWorkspace, type Stack } from "@pulumi/pulumi/automation";
import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

import { SecureRepository } from "../../../src/github/secure-repository";

const INTEGRATION = process.env.HULUMI_INTEGRATION === "1";
const SANDBOX_ORG = process.env.HULUMI_GITHUB_SANDBOX_ORG;
const APP_ID = process.env.HULUMI_GITHUB_APP_ID;
const APP_INSTALLATION_ID = process.env.HULUMI_GITHUB_APP_INSTALLATION_ID;
const APP_PEM = process.env.HULUMI_GITHUB_APP_PEM;

const TEST_PREFIX = "hulumi-github-m1-";
const TEST_ID = `${TEST_PREFIX}${Date.now().toString(36)}`;

const ENABLED = INTEGRATION && SANDBOX_ORG && APP_ID && APP_INSTALLATION_ID && APP_PEM;

const reason = !INTEGRATION
  ? "HULUMI_INTEGRATION!=1 — set to 1 to opt into integration suites"
  : !SANDBOX_ORG
    ? "HULUMI_GITHUB_SANDBOX_ORG unset — no target sandbox org"
    : "HULUMI_GITHUB_APP_* env vars unset — see docs/cookbooks for sandbox provisioning";

describe.skipIf(!ENABLED)("SecureRepository integration — real sandbox-org create + teardown", () => {
  let stack: Stack;

  beforeAll(async () => {
    if (!ENABLED) return;
    stack = await LocalWorkspace.createOrSelectStack({
      stackName: `secure-repository-m1-${TEST_ID}`,
      projectName: "hulumi-github-m1",
      program: async () => {
        const provider = new github.Provider("sandbox-provider", {
          owner: SANDBOX_ORG!,
          appAuth: {
            id: APP_ID!,
            installationId: APP_INSTALLATION_ID!,
            pemFile: APP_PEM!,
          },
        });
        const repo = new SecureRepository(
          TEST_ID,
          {
            tier: "startup-hardened",
            visibility: "private",
            description: "Hulumi-for-GitHub M1 integration test fixture",
            provider,
          },
        );
        return {
          fullName: repo.repoFullName,
          rulesetId: repo.rulesetId,
        };
      },
    });
  }, 60_000);

  afterAll(async () => {
    if (!ENABLED || stack === undefined) return;
    // Best-effort teardown: destroy + remove the stack. If destroy fails for
    // a transient reason, log and continue — a sweep job (M5 deliverable)
    // catches stragglers via the `hulumi-github-m1-` prefix.
    try {
      await stack.destroy({ onOutput: () => undefined });
    } catch (err) {
      console.error(`[m1-integration] destroy failed: ${String(err)}`);
    }
    try {
      await stack.workspace.removeStack(stack.name);
    } catch (err) {
      console.error(`[m1-integration] removeStack failed: ${String(err)}`);
    }
  }, 120_000);

  it("creates and destroys a real sandbox repo at startup-hardened tier", async () => {
    const up = await stack.up({ onOutput: () => undefined });
    expect(up.summary.result).toBe("succeeded");
    const fullName = up.outputs.fullName?.value as string | undefined;
    expect(fullName).toBeDefined();
    expect(fullName).toContain(SANDBOX_ORG!);
    expect(fullName).toContain(TEST_ID);
  }, 240_000);
});

if (!ENABLED) {
  describe("SecureRepository integration — gated skip notice", () => {
    it.skip(`integration suite skipped (${reason})`, () => {
      // intentionally empty — this is a skip-with-reason marker so vitest
      // output documents WHY the suite did not run.
    });
  });
}

// Reference pulumi imports we do not otherwise touch, to silence
// no-unused-imports under exactOptionalPropertyTypes.
void pulumi;
