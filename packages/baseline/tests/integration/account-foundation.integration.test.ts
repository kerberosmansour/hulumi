// Real-AWS integration tests for `AccountFoundation`.
//
// The weekly/manual path proves the secured backend + OIDC + Pulumi Automation
// API path can create, inspect, and destroy real AccountFoundation stacks for
// both supported tiers. Failure-injection remains roadmap work because it needs
// a separate cost and blast-radius contract.

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import {
  LocalWorkspace,
  PulumiCommand,
  type InlineProgramArgs,
  type Stack,
} from "@pulumi/pulumi/automation";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AccountFoundation } from "../../src/aws/account-foundation";

const RUN_INTEGRATION = process.env.HULUMI_INTEGRATION === "1";
const RAW_TIER = process.env.HULUMI_TIER ?? "sandbox";
const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const IAC_ROLE_ARN = process.env.HULUMI_IAC_ROLE_ARN;
const HAS_BACKEND = Boolean(process.env.PULUMI_BACKEND_URL ?? process.env.PULUMI_ACCESS_TOKEN);

type AccountFoundationIntegrationTier = "sandbox" | "startup-hardened";

function parseIntegrationTier(value: string): AccountFoundationIntegrationTier | undefined {
  return value === "sandbox" || value === "startup-hardened" ? value : undefined;
}

const SELECTED_TIER = parseIntegrationTier(RAW_TIER);
const ENABLED = Boolean(
  RUN_INTEGRATION && SELECTED_TIER !== undefined && HAS_BACKEND && IAC_ROLE_ARN,
);
const TEST_ID = randomUUID().replace(/-/g, "").slice(0, 10);
const RESOURCE_PREFIX = `af-e2e-${SELECTED_TIER === "startup-hardened" ? "sh" : "sb"}-${TEST_ID}`;
const STACK_NAME = `${SELECTED_TIER ?? "unknown"}-${TEST_ID}`;
const PROJECT_NAME = "hulumi-account-foundation-e2e";
const WORK_DIR = resolve(__dirname, ".tmp", `${PROJECT_NAME}-${TEST_ID}`);
const PULUMI_HOME = resolve(WORK_DIR, ".pulumi-home");
const STARTUP_LOG_TARGET_BUCKET = `${RESOURCE_PREFIX}-logs-self-logging`;
const AWS_POLL_MS = 10_000;
const AWS_REACHABILITY_TIMEOUT_MS = 5 * 60 * 1000;
const execFileAsync = promisify(execFile);

interface CloudTrailGetTrailResponse {
  Trail?: {
    TrailARN?: string;
    IsMultiRegionTrail?: boolean;
    LogFileValidationEnabled?: boolean;
  };
}

interface CloudTrailStatusResponse {
  IsLogging?: boolean;
}

interface ConfigRecorderResponse {
  ConfigurationRecorders?: Array<{ name?: string }>;
}

interface GuardDutyDetectorResponse {
  Status?: string;
}

interface SecurityHubDescribeHubResponse {
  HubArn?: string;
}

interface KmsDescribeKeyResponse {
  KeyMetadata?: {
    KeyState?: string;
  };
}

interface KmsRotationStatusResponse {
  KeyRotationEnabled?: boolean;
}

interface CallerIdentityResponse {
  Account?: string;
}

function requireSelectedTier(): AccountFoundationIntegrationTier {
  if (SELECTED_TIER === undefined) {
    throw new Error(`Unsupported HULUMI_TIER=${RAW_TIER}`);
  }
  return SELECTED_TIER;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function errorText(err: unknown): string {
  if (err instanceof Error) {
    const stderr = "stderr" in err && typeof err.stderr === "string" ? err.stderr : "";
    return `${err.message}\n${stderr}`;
  }
  return String(err);
}

function isMissingAwsResource(err: unknown): boolean {
  // `aws s3api head-bucket` on an absent bucket returns a bare HTTP
  // "An error occurred (404) ... : Not Found" (spaced) rather than a
  // named code like NoSuchBucket, so the NotFound token must tolerate
  // the spaced form. Scoped to 404/absent only — 403 Forbidden stays a
  // hard error so we never try to recreate a bucket we cannot access.
  return /NoSuchBucket|NoSuchEntity|Not\s?Found|NotFoundException|ResourceNotFoundException/i.test(
    errorText(err),
  );
}

async function aws(args: readonly string[], timeout = 30_000): Promise<string> {
  const { stdout } = await execFileAsync("aws", [...args], {
    timeout,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

async function awsJson<T>(args: readonly string[], timeout = 30_000): Promise<T> {
  const stdout = await aws([...args, "--output", "json"], timeout);
  return JSON.parse(stdout) as T;
}

async function waitUntil(description: string, check: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + AWS_REACHABILITY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(AWS_POLL_MS);
  }
  throw new Error(
    `${description} did not become reachable within ${AWS_REACHABILITY_TIMEOUT_MS}ms`,
  );
}

async function findExistingGuardDutyDetectorId(region: string): Promise<string | undefined> {
  const parsed = await awsJson<{ DetectorIds?: unknown }>([
    "guardduty",
    "list-detectors",
    "--region",
    region,
  ]);
  if (!Array.isArray(parsed.DetectorIds)) {
    return undefined;
  }
  return parsed.DetectorIds.find((id): id is string => typeof id === "string" && id.length > 0);
}

async function isSecurityHubEnabled(region: string): Promise<boolean> {
  try {
    await awsJson<SecurityHubDescribeHubResponse>([
      "securityhub",
      "describe-hub",
      "--region",
      region,
    ]);
    return true;
  } catch (err) {
    const text = errorText(err);
    if (/InvalidAccessException|not subscribed|not enabled/i.test(text)) {
      return false;
    }
    throw err;
  }
}

function envWithDefined(values: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

async function ensureStartupLoggingTargetBucket(): Promise<void> {
  if (SELECTED_TIER !== "startup-hardened") return;

  try {
    await aws(["s3api", "head-bucket", "--bucket", STARTUP_LOG_TARGET_BUCKET]);
  } catch (err) {
    if (!isMissingAwsResource(err)) throw err;
    const createBucketArgs =
      REGION === "us-east-1"
        ? ["s3api", "create-bucket", "--bucket", STARTUP_LOG_TARGET_BUCKET, "--region", REGION]
        : [
            "s3api",
            "create-bucket",
            "--bucket",
            STARTUP_LOG_TARGET_BUCKET,
            "--region",
            REGION,
            "--create-bucket-configuration",
            `LocationConstraint=${REGION}`,
          ];
    await aws(createBucketArgs);
  }

  await aws([
    "s3api",
    "put-public-access-block",
    "--bucket",
    STARTUP_LOG_TARGET_BUCKET,
    "--public-access-block-configuration",
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true",
  ]);
  await aws([
    "s3api",
    "put-bucket-encryption",
    "--bucket",
    STARTUP_LOG_TARGET_BUCKET,
    "--server-side-encryption-configuration",
    '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"},"BucketKeyEnabled":true}]}',
  ]);

  const identity = await awsJson<CallerIdentityResponse>(["sts", "get-caller-identity"]);
  const account = identity.Account;
  if (account === undefined || account.length === 0) {
    throw new Error("Unable to resolve AWS account for startup logging target policy");
  }
  await aws([
    "s3api",
    "put-bucket-policy",
    "--bucket",
    STARTUP_LOG_TARGET_BUCKET,
    "--policy",
    JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowS3ServerAccessLogs",
          Effect: "Allow",
          Principal: { Service: "logging.s3.amazonaws.com" },
          Action: "s3:PutObject",
          Resource: `arn:aws:s3:::${STARTUP_LOG_TARGET_BUCKET}/${RESOURCE_PREFIX}-logs/*`,
          Condition: {
            StringEquals: { "aws:SourceAccount": account },
          },
        },
      ],
    }),
  ]);
}

async function cleanupStartupLoggingTargetBucket(): Promise<void> {
  if (SELECTED_TIER !== "startup-hardened") return;
  try {
    await aws(["s3", "rm", `s3://${STARTUP_LOG_TARGET_BUCKET}`, "--recursive"], 120_000);
  } catch (err) {
    if (!isMissingAwsResource(err)) throw err;
  }
  for (const args of [
    ["s3api", "delete-bucket-policy", "--bucket", STARTUP_LOG_TARGET_BUCKET],
    ["s3api", "delete-public-access-block", "--bucket", STARTUP_LOG_TARGET_BUCKET],
    ["s3api", "delete-bucket", "--bucket", STARTUP_LOG_TARGET_BUCKET, "--region", REGION],
  ]) {
    try {
      await aws(args);
    } catch (err) {
      if (!isMissingAwsResource(err)) throw err;
    }
  }
}

// IAM Access Analyzer is a Startup-Hardened-only sub-resource and AWS
// caps analyzers per account/region (default 1). A prior e2e run that
// failed AFTER the analyzer was created can orphan it (a failed
// `pulumi up` is not always reclaimed by destroy), exhausting the quota
// and blocking every later run with ServiceQuotaExceededException. Sweep
// only THIS suite's own analyzers — names are `hulumi-af-e2e-*-access-
// analyzer` — so a real account/organization analyzer is never touched.
async function sweepStaleE2eAnalyzers(): Promise<void> {
  if (SELECTED_TIER !== "startup-hardened") return;
  let listed: { analyzers?: { name?: string }[] };
  try {
    listed = await awsJson<{ analyzers?: { name?: string }[] }>([
      "accessanalyzer",
      "list-analyzers",
      "--region",
      REGION,
    ]);
  } catch (err) {
    if (isMissingAwsResource(err)) return;
    throw err;
  }
  const stale = (listed.analyzers ?? [])
    .map((a) => a.name)
    .filter(
      (name): name is string =>
        typeof name === "string" &&
        name.startsWith("hulumi-af-e2e-") &&
        name.endsWith("-access-analyzer"),
    );
  for (const name of stale) {
    try {
      await aws(["accessanalyzer", "delete-analyzer", "--analyzer-name", name, "--region", REGION]);
    } catch (err) {
      if (!isMissingAwsResource(err)) throw err;
    }
  }
}

// The Startup-Hardened SecureBucket creates a CloudTrail EventDataStore.
// A prior e2e run that created one but failed before `destroy` (or whose
// store predates the forceDestroy fix) leaves a TERMINATION-PROTECTED,
// billable store behind. Sweep only this suite's own stores —
// `af-e2e-*-data-events` — disabling termination protection first so the
// delete succeeds. Scoped by name so a real audit store is never touched.
async function sweepStaleE2eEventDataStores(): Promise<void> {
  if (SELECTED_TIER !== "startup-hardened") return;
  let listed: {
    EventDataStores?: {
      EventDataStoreArn?: string;
      Name?: string;
      TerminationProtectionEnabled?: boolean;
      Status?: string;
    }[];
  };
  try {
    listed = await awsJson(["cloudtrail", "list-event-data-stores", "--region", REGION]);
  } catch (err) {
    if (isMissingAwsResource(err)) return;
    throw err;
  }
  const stale = (listed.EventDataStores ?? []).filter(
    (
      eds,
    ): eds is {
      EventDataStoreArn: string;
      Name: string;
      TerminationProtectionEnabled?: boolean;
      Status?: string;
    } =>
      typeof eds.EventDataStoreArn === "string" &&
      typeof eds.Name === "string" &&
      eds.Name.startsWith("af-e2e-") &&
      eds.Name.endsWith("-data-events") &&
      eds.Status !== "PENDING_DELETION",
  );
  for (const eds of stale) {
    try {
      if (eds.TerminationProtectionEnabled === true) {
        await aws([
          "cloudtrail",
          "update-event-data-store",
          "--event-data-store",
          eds.EventDataStoreArn,
          "--no-termination-protection-enabled",
          "--region",
          REGION,
        ]);
      }
      await aws([
        "cloudtrail",
        "delete-event-data-store",
        "--event-data-store",
        eds.EventDataStoreArn,
        "--region",
        REGION,
      ]);
    } catch (err) {
      if (!isMissingAwsResource(err)) throw err;
    }
  }
}

function configRecorderNameFromArn(arn: string): string {
  const marker = ":recorder/";
  const index = arn.indexOf(marker);
  if (index === -1) {
    throw new Error("Config recorder output did not contain an ARN recorder segment");
  }
  return arn.slice(index + marker.length);
}

async function assertCloudTrailReachable(
  trailArn: string,
  tier: AccountFoundationIntegrationTier,
): Promise<void> {
  await waitUntil("CloudTrail trail", async () => {
    const trail = await awsJson<CloudTrailGetTrailResponse>([
      "cloudtrail",
      "get-trail",
      "--name",
      trailArn,
      "--region",
      REGION,
    ]);
    const status = await awsJson<CloudTrailStatusResponse>([
      "cloudtrail",
      "get-trail-status",
      "--name",
      trailArn,
      "--region",
      REGION,
    ]);
    const startupExpected =
      tier !== "startup-hardened" ||
      (trail.Trail?.IsMultiRegionTrail === true && trail.Trail?.LogFileValidationEnabled === true);
    return (
      typeof trail.Trail?.TrailARN === "string" &&
      trail.Trail.TrailARN.length > 0 &&
      status.IsLogging === true &&
      startupExpected
    );
  });
}

async function assertConfigRecorderReachable(recorderArn: string): Promise<void> {
  const recorderName = configRecorderNameFromArn(recorderArn);
  await waitUntil("Config recorder", async () => {
    const response = await awsJson<ConfigRecorderResponse>([
      "configservice",
      "describe-configuration-recorders",
      "--configuration-recorder-names",
      recorderName,
      "--region",
      REGION,
    ]);
    return (
      response.ConfigurationRecorders?.some((recorder) => recorder.name === recorderName) === true
    );
  });
}

async function assertGuardDutyReachable(detectorId: string): Promise<void> {
  await waitUntil("GuardDuty detector", async () => {
    const response = await awsJson<GuardDutyDetectorResponse>([
      "guardduty",
      "get-detector",
      "--detector-id",
      detectorId,
      "--region",
      REGION,
    ]);
    return response.Status === "ENABLED";
  });
}

async function assertSecurityHubReachable(): Promise<void> {
  await waitUntil("Security Hub hub", async () => {
    const response = await awsJson<SecurityHubDescribeHubResponse>([
      "securityhub",
      "describe-hub",
      "--region",
      REGION,
    ]);
    return typeof response.HubArn === "string" && response.HubArn.includes(":securityhub:");
  });
}

async function assertKmsKeysReachable(kmsKeyArns: Record<string, string>): Promise<void> {
  expect(Object.keys(kmsKeyArns).sort()).toEqual(["config", "data", "logs", "secrets"]);
  for (const [service, arn] of Object.entries(kmsKeyArns)) {
    await waitUntil(`KMS ${service} key`, async () => {
      const key = await awsJson<KmsDescribeKeyResponse>([
        "kms",
        "describe-key",
        "--key-id",
        arn,
        "--region",
        REGION,
      ]);
      const rotation = await awsJson<KmsRotationStatusResponse>([
        "kms",
        "get-key-rotation-status",
        "--key-id",
        arn,
        "--region",
        REGION,
      ]);
      return key.KeyMetadata?.KeyState === "Enabled" && rotation.KeyRotationEnabled === true;
    });
  }
}

async function assertKmsKeysNotEnabled(kmsKeyArns: Record<string, string>): Promise<void> {
  const stillEnabled: string[] = [];
  for (const [service, arn] of Object.entries(kmsKeyArns)) {
    try {
      const key = await awsJson<KmsDescribeKeyResponse>([
        "kms",
        "describe-key",
        "--key-id",
        arn,
        "--region",
        REGION,
      ]);
      if (key.KeyMetadata?.KeyState === "Enabled") {
        stillEnabled.push(service);
      }
    } catch (err) {
      if (!isMissingAwsResource(err)) throw err;
    }
  }
  if (stillEnabled.length > 0) {
    throw new Error(
      `[account-foundation-e2e] KMS keys still enabled after destroy: ${stillEnabled.join(", ")}`,
    );
  }
}

const skipReason = !RUN_INTEGRATION
  ? "HULUMI_INTEGRATION!=1 — set to 1 to opt into real-AWS integration"
  : SELECTED_TIER === undefined
    ? `HULUMI_TIER=${RAW_TIER} — expected sandbox or startup-hardened`
    : !HAS_BACKEND
      ? "no Pulumi backend configured — set PULUMI_BACKEND_URL or PULUMI_ACCESS_TOKEN"
      : "HULUMI_IAC_ROLE_ARN unset — AccountFoundation requires the IaC role ARN";

describe("AccountFoundation — real AWS integration (weekly)", () => {
  // See docs/integration-testing-roadmap.md#account-foundation for the
  // remaining failure-injection contract. Success-path sandbox and
  // startup-hardened deploy/assert/destroy coverage lives below.
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

describe.skipIf(!ENABLED)(
  "AccountFoundation — real AWS deploy/assert/destroy (OIDC + Pulumi backend)",
  () => {
    let stack: Stack | undefined;
    let existingGuardDutyDetectorId: string | undefined;
    let useExistingSecurityHubAccount = false;
    let kmsKeyArns: Record<string, string> = {};

    beforeAll(async () => {
      mkdirSync(WORK_DIR, { recursive: true });
      await sweepStaleE2eAnalyzers();
      await sweepStaleE2eEventDataStores();
      await ensureStartupLoggingTargetBucket();
      existingGuardDutyDetectorId = await findExistingGuardDutyDetectorId(REGION);
      useExistingSecurityHubAccount = await isSecurityHubEnabled(REGION);
      const pulumiCommand = await PulumiCommand.install();
      const tier = requireSelectedTier();
      const args: InlineProgramArgs = {
        stackName: STACK_NAME,
        projectName: PROJECT_NAME,
        program: async () => {
          const foundation = new AccountFoundation(RESOURCE_PREFIX, {
            tier,
            iacRoleArn: IAC_ROLE_ARN!,
            region: REGION,
            logBucketForceDestroy: true,
            ...(tier === "startup-hardened" ? { kmsDenyWithoutTag: "off" as const } : {}),
            ...(existingGuardDutyDetectorId !== undefined ? { existingGuardDutyDetectorId } : {}),
            ...(useExistingSecurityHubAccount ? { useExistingSecurityHubAccount } : {}),
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
          await assertKmsKeysNotEnabled(kmsKeyArns);
        } catch (err) {
          console.error("[account-foundation-e2e] KMS cleanup assertion failed");
          if (cleanupError === undefined) {
            cleanupError = err;
          }
        }
        try {
          await stack.workspace.removeStack(stack.name);
        } catch (err) {
          console.error("[account-foundation-e2e] removeStack failed");
          if (cleanupError === undefined) {
            cleanupError = err;
          }
        }
        try {
          await cleanupStartupLoggingTargetBucket();
        } catch (err) {
          console.error("[account-foundation-e2e] startup log target cleanup failed");
          if (cleanupError === undefined) {
            cleanupError = err;
          }
        }
        try {
          await sweepStaleE2eAnalyzers();
        } catch (err) {
          console.error("[account-foundation-e2e] stale analyzer sweep failed");
          if (cleanupError === undefined) {
            cleanupError = err;
          }
        }
        try {
          await sweepStaleE2eEventDataStores();
        } catch (err) {
          console.error("[account-foundation-e2e] stale event-data-store sweep failed");
          if (cleanupError === undefined) {
            cleanupError = err;
          }
        }
        rmSync(WORK_DIR, { recursive: true, force: true });
        if (cleanupError !== undefined) {
          throw cleanupError;
        }
      } else {
        await cleanupStartupLoggingTargetBucket();
        await sweepStaleE2eAnalyzers();
        await sweepStaleE2eEventDataStores();
        rmSync(WORK_DIR, { recursive: true, force: true });
      }
    }, 300_000);

    it("deploys AccountFoundation, reaches AWS APIs, and leaves no enabled KMS keys after destroy", async () => {
      expect(stack).toBeDefined();
      const up = await stack!.up({ onOutput: () => undefined });
      expect(up.summary.result).toBe("succeeded");

      const outputs = up.outputs;
      expect(outputs.cloudTrailArn?.value).toEqual(expect.stringContaining(":cloudtrail:"));
      expect(outputs.configRecorderArn?.value).toEqual(expect.stringContaining(":config:"));
      expect(outputs.guardDutyDetectorId?.value).toEqual(expect.any(String));
      expect(outputs.securityHubHubArn?.value).toEqual(expect.stringContaining(":securityhub:"));

      const trailArn = outputs.cloudTrailArn?.value as string;
      const configRecorderArn = outputs.configRecorderArn?.value as string;
      const guardDutyDetectorId = outputs.guardDutyDetectorId?.value as string;
      const outputKmsKeyArns = outputs.kmsKeyArns?.value as Record<string, string> | undefined;
      expect(outputKmsKeyArns).toBeDefined();
      kmsKeyArns = outputKmsKeyArns ?? {};

      await assertCloudTrailReachable(trailArn, requireSelectedTier());
      await assertConfigRecorderReachable(configRecorderArn);
      await assertGuardDutyReachable(guardDutyDetectorId);
      await assertSecurityHubReachable();
      await assertKmsKeysReachable(kmsKeyArns);
    }, 900_000);
  },
);

if (!ENABLED) {
  describe("AccountFoundation — real AWS integration skip notice", () => {
    it.skip(`integration suite skipped (${skipReason})`, () => {
      // intentionally empty
    });
  });
}
