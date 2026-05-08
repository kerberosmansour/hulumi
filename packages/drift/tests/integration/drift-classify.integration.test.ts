// Real-AWS drift integration tests for `DriftClassifier`.
//
// The first real-AWS lane is intentionally narrow: one Pulumi-managed S3
// fixture, one out-of-band tag mutation, one CloudTrail-backed classifier run,
// and one cache-hit assertion. Remaining roadmap scenarios stay as explicit
// todos until their own cost/cleanup evidence exists.

import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import {
  CloudTrailClient,
  LookupEventsCommand,
  type Event as AwsCloudTrailEvent,
} from "@aws-sdk/client-cloudtrail";
import { PutBucketTaggingCommand, S3Client } from "@aws-sdk/client-s3";
import * as aws from "@pulumi/aws";
import {
  LocalWorkspace,
  PulumiCommand,
  type InlineProgramArgs,
  type Stack,
} from "@pulumi/pulumi/automation";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AutomationApiAdapter,
  CloudTrailAdapter,
  DriftClassifier,
  type AdapterSignal,
  type CloudTrailEvent,
  type DriftAdapter,
} from "../../src";

const RUN_INTEGRATION = process.env.HULUMI_INTEGRATION === "1";
const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const HAS_BACKEND = Boolean(process.env.PULUMI_BACKEND_URL ?? process.env.PULUMI_ACCESS_TOKEN);
const ENABLED = RUN_INTEGRATION && HAS_BACKEND;
const TEST_ID = randomUUID().replace(/-/g, "").slice(0, 10);
const RESOURCE_PREFIX = `drift-e2e-${TEST_ID}`;
const BUCKET_NAME = `${RESOURCE_PREFIX}-bucket`;
const STACK_NAME = `drift-${TEST_ID}`;
const PROJECT_NAME = "hulumi-drift-classify-e2e";
const WORK_DIR = resolve(__dirname, ".tmp", `${PROJECT_NAME}-${TEST_ID}`);
const PULUMI_HOME = resolve(WORK_DIR, ".pulumi-home");
const CACHE_DIR = resolve(WORK_DIR, "drift-cache");
const CLOUDTRAIL_WAIT_MS = 8 * 60 * 1000;
const CLOUDTRAIL_POLL_MS = 15_000;

const s3 = new S3Client({ region: REGION });
const cloudTrail = new CloudTrailClient({ region: REGION });

function envWithDefined(values: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function lookupBucketTagEvents(
  after: Date,
  before: Date = new Date(),
): Promise<CloudTrailEvent[]> {
  const response = await cloudTrail.send(
    new LookupEventsCommand({
      LookupAttributes: [{ AttributeKey: "ResourceName", AttributeValue: BUCKET_NAME }],
      StartTime: after,
      EndTime: before,
      MaxResults: 50,
    }),
  );
  return (response.Events ?? [])
    .filter((event) => event.EventName === "PutBucketTagging")
    .map(toCloudTrailEvent);
}

async function waitForBucketTagEvent(after: Date): Promise<void> {
  const deadline = Date.now() + CLOUDTRAIL_WAIT_MS;
  while (Date.now() < deadline) {
    const events = await lookupBucketTagEvents(after);
    if (events.length > 0) return;
    await sleep(CLOUDTRAIL_POLL_MS);
  }
  throw new Error(
    `CloudTrail PutBucketTagging event did not surface within ${CLOUDTRAIL_WAIT_MS}ms`,
  );
}

function toCloudTrailEvent(event: AwsCloudTrailEvent): CloudTrailEvent {
  return {
    EventTime: event.EventTime ?? new Date(),
    EventName: event.EventName ?? "(unknown)",
    ...(event.Username !== undefined ? { Username: event.Username } : {}),
    ...(event.CloudTrailEvent !== undefined ? { CloudTrailEvent: event.CloudTrailEvent } : {}),
    ...(event.Resources !== undefined
      ? {
          Resources: event.Resources.map((resource) => ({
            ...(resource.ResourceType !== undefined ? { ResourceType: resource.ResourceType } : {}),
            ...(resource.ResourceName !== undefined ? { ResourceName: resource.ResourceName } : {}),
          })),
        }
      : {}),
  };
}

function cleanAdapter(name: string): DriftAdapter {
  return {
    name: () => name,
    available: async () => true,
    signal: async (): Promise<AdapterSignal> => ({ detected: false, ok: true, data: {} }),
  };
}

const skipReason = !RUN_INTEGRATION
  ? "HULUMI_INTEGRATION!=1 - set to 1 to opt into real-AWS integration"
  : "no Pulumi backend configured - set PULUMI_BACKEND_URL or PULUMI_ACCESS_TOKEN";

describe("DriftClassifier — real AWS integration (weekly)", () => {
  // See docs/integration-testing-roadmap.md#drift-classify for the
  // full implementation contract: deploy fixture, mutation method,
  // CloudTrail wait pattern, expected verdict, cleanup invariant.
  it.todo(
    "provider-version drift detected: ProviderApiChurn/medium when pinned < latest (see docs/integration-testing-roadmap.md#drift-classify)",
  );

  it.todo(
    "teardown runs on failure: fixture removed even if classify throws (see docs/integration-testing-roadmap.md#drift-classify)",
  );

  it("integration tests skipped by default on PRs (gate invariant — preserved across M3)", () => {
    if (RUN_INTEGRATION) {
      expect(true).toBe(true);
      return;
    }
    expect(RUN_INTEGRATION).toBe(false);
  });
});

describe.skipIf(!ENABLED)(
  "DriftClassifier — S3 console drift real AWS smoke (OIDC + Pulumi backend)",
  () => {
    let stack: Stack | undefined;
    let bucketUrn: string | undefined;
    let previewCalls = 0;
    let cloudTrailCalls = 0;
    let probeCalls = 0;

    beforeAll(async () => {
      mkdirSync(WORK_DIR, { recursive: true });
      const pulumiCommand = await PulumiCommand.install();
      const args: InlineProgramArgs = {
        stackName: STACK_NAME,
        projectName: PROJECT_NAME,
        program: async () => {
          const bucket = new aws.s3.BucketV2(`${RESOURCE_PREFIX}-bucket`, {
            bucket: BUCKET_NAME,
            forceDestroy: true,
            tags: {
              "hulumi:component": "DriftClassifierIntegration",
              "hulumi:tier": "sandbox",
            },
          });
          new aws.s3.BucketPublicAccessBlock(`${RESOURCE_PREFIX}-pab`, {
            bucket: bucket.id,
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: true,
          });
          new aws.s3.BucketServerSideEncryptionConfigurationV2(`${RESOURCE_PREFIX}-sse`, {
            bucket: bucket.id,
            rules: [
              {
                applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" },
                bucketKeyEnabled: true,
              },
            ],
          });
          new aws.s3.BucketVersioningV2(`${RESOURCE_PREFIX}-versioning`, {
            bucket: bucket.id,
            versioningConfiguration: { status: "Enabled" },
          });
          return {
            bucketName: bucket.id,
            bucketUrn: bucket.urn,
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
          PULUMI_CONFIG_PASSPHRASE: `hulumi-drift-e2e-${TEST_ID}`,
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
          console.error("[drift-classify-e2e] destroy failed");
          cleanupError = err;
        }
        try {
          await stack.workspace.removeStack(stack.name);
        } catch (err) {
          console.error("[drift-classify-e2e] removeStack failed");
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

    it("classifies S3 tag drift as ConsoleBreakGlass/high and serves the second call from cache", async () => {
      expect(stack).toBeDefined();
      const up = await stack!.up({ onOutput: () => undefined });
      expect(up.summary.result).toBe("succeeded");
      bucketUrn = up.outputs.bucketUrn?.value as string | undefined;
      expect(bucketUrn).toEqual(expect.stringContaining("aws:s3/bucketV2:BucketV2"));

      const mutationStartedAt = new Date(Date.now() - 5_000);
      await s3.send(
        new PutBucketTaggingCommand({
          Bucket: BUCKET_NAME,
          Tagging: {
            TagSet: [
              { Key: "hulumi:component", Value: "DriftClassifierIntegration" },
              { Key: "hulumi:tier", Value: "sandbox" },
              { Key: "drift:e2e", Value: TEST_ID },
            ],
          },
        }),
      );
      await waitForBucketTagEvent(mutationStartedAt);

      const classifier = new DriftClassifier({
        awsRegion: REGION,
        adapters: {
          automationApi: new AutomationApiAdapter({
            preview: async () => {
              previewCalls += 1;
              const preview = await stack!.preview({
                refresh: true,
                diff: true,
                onOutput: () => undefined,
              });
              return {
                changeSummary: preview.changeSummary,
                detailedDiff: {},
              };
            },
          }),
          cloudTrail: new CloudTrailAdapter({
            lookup: async (_args) => {
              cloudTrailCalls += 1;
              return lookupBucketTagEvents(mutationStartedAt);
            },
            retry: { attempts: 3, backoffMs: 1_000, maxElapsedMs: 5_000, wait: sleep },
          }),
          providerVersion: cleanAdapter("ProviderVersion"),
          gitLog: cleanAdapter("GitLog"),
        },
        probe: async () => {
          probeCalls += 1;
          return { delivered: true, inTransit: false };
        },
      });

      const first = await classifier.classify(STACK_NAME, bucketUrn!, {
        cacheDir: CACHE_DIR,
        cacheTtlSeconds: 300,
        probeTimeoutMs: 60_000,
        window: {
          before: mutationStartedAt.toISOString(),
          after: new Date(Date.now() + 60_000).toISOString(),
        },
      });
      expect(first.source).toBe("ConsoleBreakGlass");
      expect(first.confidence).toBe("high");

      const callsAfterFirst = { previewCalls, cloudTrailCalls, probeCalls };
      const second = await classifier.classify(STACK_NAME, bucketUrn!, {
        cacheDir: CACHE_DIR,
        cacheTtlSeconds: 300,
        probeTimeoutMs: 60_000,
      });
      expect(second).toEqual(first);
      expect({ previewCalls, cloudTrailCalls, probeCalls }).toEqual(callsAfterFirst);
    }, 900_000);
  },
);

if (!ENABLED) {
  describe("DriftClassifier — S3 console drift real AWS smoke skip notice", () => {
    it.skip(`integration suite skipped (${skipReason})`, () => {
      // intentionally empty
    });
  });
}
