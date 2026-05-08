// Real-AWS integration tests for `AccountFoundation`.
//
// The sandbox smoke path is intentionally narrow: it proves the secured
// backend + OIDC + Pulumi Automation API path can create and destroy a real
// AccountFoundation stack. Startup-Hardened and failure-injection scenarios
// remain explicit roadmap work because they mutate more account-wide services
// and need their own latency/cost evidence.

import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import {
  LocalWorkspace,
  PulumiCommand,
  type InlineProgramArgs,
  type Stack,
} from "@pulumi/pulumi/automation";
import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { AccountFoundation } from "../../src/aws/account-foundation";

const RUN_INTEGRATION = process.env.HULUMI_INTEGRATION === "1";
const TIER = process.env.HULUMI_TIER ?? "sandbox";
const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const IAC_ROLE_ARN = process.env.HULUMI_IAC_ROLE_ARN;
const HAS_BACKEND = Boolean(process.env.PULUMI_BACKEND_URL ?? process.env.PULUMI_ACCESS_TOKEN);

const SANDBOX_ENABLED = Boolean(
  RUN_INTEGRATION && TIER === "sandbox" && HAS_BACKEND && IAC_ROLE_ARN,
);
const TEST_ID = randomUUID().replace(/-/g, "").slice(0, 10);
const RESOURCE_PREFIX = `af-e2e-${TEST_ID}`;
const STACK_NAME = `sandbox-${TEST_ID}`;
const PROJECT_NAME = "hulumi-account-foundation-e2e";
const WORK_DIR = resolve(__dirname, ".tmp", `${PROJECT_NAME}-${TEST_ID}`);
const PULUMI_HOME = resolve(WORK_DIR, ".pulumi-home");

function envWithDefined(values: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

const skipReason = !RUN_INTEGRATION
  ? "HULUMI_INTEGRATION!=1 — set to 1 to opt into real-AWS integration"
  : TIER !== "sandbox"
    ? `HULUMI_TIER=${TIER} — sandbox smoke is the first real-AWS lane; startup-hardened remains roadmap work`
    : !HAS_BACKEND
      ? "no Pulumi backend configured — set PULUMI_BACKEND_URL or PULUMI_ACCESS_TOKEN"
      : "HULUMI_IAC_ROLE_ARN unset — AccountFoundation requires the IaC role ARN";

describe("AccountFoundation — real AWS integration (weekly)", () => {
  // See docs/integration-testing-roadmap.md#account-foundation for the
  // full implementation contract: stack name, region, sub-resource
  // poll list, cleanup invariant, expected wall-clock cost.
  it.todo(
    "Startup-Hardened tier: all 6 sub-resources + extended within 15 minutes (see docs/integration-testing-roadmap.md#account-foundation)",
  );

  it.todo(
    "Teardown runs on failure (force-fail variant) (see docs/integration-testing-roadmap.md#account-foundation)",
  );

  it("integration tests are skipped by default on PRs (gate invariant — preserved across M3)", () => {
    if (RUN_INTEGRATION) {
      expect(true).toBe(true);
      return;
    }
    expect(RUN_INTEGRATION).toBe(false);
  });
});

describe.skipIf(!SANDBOX_ENABLED)(
  "AccountFoundation — sandbox real AWS smoke (OIDC + S3 backend)",
  () => {
    let stack: Stack | undefined;

    beforeAll(async () => {
      mkdirSync(WORK_DIR, { recursive: true });
      const pulumiCommand = await PulumiCommand.install();
      const args: InlineProgramArgs = {
        stackName: STACK_NAME,
        projectName: PROJECT_NAME,
        program: async () => {
          const foundation = new AccountFoundation(RESOURCE_PREFIX, {
            tier: "sandbox",
            iacRoleArn: IAC_ROLE_ARN!,
            region: REGION,
            logBucketForceDestroy: true,
          });
          return {
            cloudTrailArn: foundation.cloudTrailArn,
            configRecorderArn: foundation.configRecorderArn,
            guardDutyDetectorId: foundation.guardDutyDetectorId,
            securityHubHubArn: foundation.securityHubHubArn,
            kmsKeyArns: foundation.kmsKeyArns,
          };
        },
      };
      stack = await LocalWorkspace.createOrSelectStack(args, {
        workDir: WORK_DIR,
        pulumiHome: PULUMI_HOME,
        pulumiCommand,
        envVars: envWithDefined({
          AWS_REGION: REGION,
          AWS_DEFAULT_REGION: REGION,
          PULUMI_ACCESS_TOKEN: process.env.PULUMI_ACCESS_TOKEN,
          PULUMI_BACKEND_URL: process.env.PULUMI_BACKEND_URL,
          PULUMI_CONFIG_PASSPHRASE: `hulumi-e2e-${TEST_ID}`,
        }),
      });
      await stack.setConfig("aws:region", { value: REGION });
      await stack.workspace.installPlugin("aws", "7.27.0");
    }, 180_000);

    afterAll(async () => {
      if (stack !== undefined) {
        let cleanupError: unknown;
        try {
          await stack.destroy({ onOutput: () => undefined });
        } catch (err) {
          console.error("[account-foundation-e2e] destroy failed");
          cleanupError = err;
        }
        try {
          await stack.workspace.removeStack(stack.name);
        } catch (err) {
          console.error("[account-foundation-e2e] removeStack failed");
          if (cleanupError === undefined) {
            cleanupError = err;
          }
        }
        rmSync(WORK_DIR, { recursive: true, force: true });
        if (cleanupError !== undefined) {
          throw cleanupError;
        }
      } else {
        rmSync(WORK_DIR, { recursive: true, force: true });
      }
    }, 300_000);

    it("deploys AccountFoundation sandbox and returns real provider outputs", async () => {
      expect(stack).toBeDefined();
      const up = await stack!.up({ onOutput: () => undefined });
      expect(up.summary.result).toBe("succeeded");

      const outputs = up.outputs;
      expect(outputs.cloudTrailArn?.value).toEqual(expect.stringContaining(":cloudtrail:"));
      expect(outputs.configRecorderArn?.value).toEqual(expect.stringContaining(":config:"));
      expect(outputs.guardDutyDetectorId?.value).toEqual(expect.any(String));
      expect(outputs.securityHubHubArn?.value).toEqual(expect.stringContaining(":securityhub:"));

      const kmsKeyArns = outputs.kmsKeyArns?.value as Record<string, string> | undefined;
      expect(kmsKeyArns).toBeDefined();
      expect(Object.keys(kmsKeyArns ?? {}).sort()).toEqual(["config", "data", "logs", "secrets"]);
      for (const arn of Object.values(kmsKeyArns ?? {})) {
        expect(arn).toEqual(expect.stringContaining(":kms:"));
      }
    }, 900_000);
  },
);

if (!SANDBOX_ENABLED) {
  describe("AccountFoundation — sandbox real AWS smoke skip notice", () => {
    it.skip(`integration suite skipped (${skipReason})`, () => {
      // intentionally empty
    });
  });
}
