// Real-AWS integration proof for the guarded S3 reconciler primitive.
//
// This suite is intentionally double-gated:
// - HULUMI_INTEGRATION=1 follows the repo-wide integration convention.
// - HULUMI_RECONCILER_AWS_INTEGRATION=1 opts into live S3 mutations.
//
// Without both flags and a sandbox AWS identity, the file contributes only a
// visible skip notice. With both flags, it creates one scoped versioned bucket,
// proves plan mode does not mutate it, executes the S3 sweeper, and verifies
// zero in-scope bucket remains. Logs and assertion messages avoid bucket names
// and object keys.

import { randomUUID } from "node:crypto";

import {
  type BucketLocationConstraint,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  HeadBucketCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, describe, expect, it } from "vitest";

import { S3SweeperExecutor } from "../../src/adapters/s3-sweeper";
import { OrphanReconciler } from "../../src/reconciler";

const RUN_INTEGRATION = process.env.HULUMI_INTEGRATION === "1";
const RUN_RECONCILER_AWS = process.env.HULUMI_RECONCILER_AWS_INTEGRATION === "1";
const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const TEST_ID = randomUUID().replace(/-/g, "").slice(0, 10);
const RESOURCE_PREFIX = `hulumi-drift-e2e-${TEST_ID}`;
const BUCKET_NAME = `${RESOURCE_PREFIX}-bucket`;
const OBJECT_KEY = "fixture.txt";
const enabled = RUN_INTEGRATION && RUN_RECONCILER_AWS;
const s3 = new S3Client({ region: REGION });

async function bucketExists(): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

async function createFixtureBucket(): Promise<void> {
  if (REGION === "us-east-1") {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
  } else {
    await s3.send(
      new CreateBucketCommand({
        Bucket: BUCKET_NAME,
        CreateBucketConfiguration: { LocationConstraint: REGION as BucketLocationConstraint },
      }),
    );
  }
  await s3.send(
    new PutBucketVersioningCommand({
      Bucket: BUCKET_NAME,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );
  await s3.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: OBJECT_KEY, Body: "v1" }));
  await s3.send(new PutObjectCommand({ Bucket: BUCKET_NAME, Key: OBJECT_KEY, Body: "v2" }));
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: OBJECT_KEY }));
}

async function cleanupFixtureBucket(): Promise<void> {
  let versions;
  try {
    versions = await s3.send(new ListObjectVersionsCommand({ Bucket: BUCKET_NAME }));
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
  const objects = [
    ...(versions.Versions ?? []).map((entry) => ({ Key: entry.Key, VersionId: entry.VersionId })),
    ...(versions.DeleteMarkers ?? []).map((entry) => ({
      Key: entry.Key,
      VersionId: entry.VersionId,
    })),
  ].filter((entry): entry is { Key: string; VersionId: string } => {
    return entry.Key !== undefined && entry.VersionId !== undefined;
  });
  if (objects.length > 0) {
    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET_NAME,
        Delete: { Objects: objects, Quiet: true },
      }),
    );
  }
  try {
    await s3.send(new DeleteBucketCommand({ Bucket: BUCKET_NAME }));
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof Error && /NoSuchBucket|NotFound|404/i.test(err.name + err.message);
}

function target(ownershipSignals = 2) {
  return {
    inState: false,
    existsInCloud: true,
    identity: {
      provider: "aws" as const,
      type: "aws:s3/bucketV2:BucketV2",
      physicalId: BUCKET_NAME,
      region: REGION,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    ownership:
      ownershipSignals >= 2
        ? [
            { signal: "name-prefix" as const, subject: BUCKET_NAME, confidence: "high" as const },
            {
              signal: "caller" as const,
              subject: "hulumi-reconciler-integration",
              confidence: "high" as const,
            },
          ]
        : [{ signal: "name-prefix" as const, subject: BUCKET_NAME, confidence: "high" as const }],
  };
}

describe.skipIf(!enabled)("OrphanReconciler S3 real-AWS zero-orphan proof", () => {
  afterAll(async () => {
    await cleanupFixtureBucket();
  }, 120_000);

  it("plans, executes, and verifies zero in-scope S3 orphan remains", async () => {
    await cleanupFixtureBucket();
    await createFixtureBucket();

    const before = await s3.send(new GetBucketVersioningCommand({ Bucket: BUCKET_NAME }));
    expect(before.Status).toBe("Enabled");

    const dryRun = new OrphanReconciler().plan({
      mode: "plan",
      scope: { resourcePrefix: RESOURCE_PREFIX, regions: [REGION], minAgeMinutes: 15 },
      targets: [target()],
    });
    expect(dryRun.executable).toBe(false);
    expect(await bucketExists()).toBe(true);

    const weakEvidence = new OrphanReconciler().plan({
      mode: "sweep-only",
      scope: { resourcePrefix: RESOURCE_PREFIX, regions: [REGION], ownershipMinSignals: 2 },
      targets: [target(1)],
    });
    expect(weakEvidence.executable).toBe(false);
    expect(weakEvidence.actions[0]?.blockedActions.map((blocked) => blocked.reason)).toContain(
      "insufficient ownership evidence",
    );

    const reconciler = new OrphanReconciler({
      executors: {
        drainS3BucketVersions: new S3SweeperExecutor({
          client: s3,
          expectedPrefix: RESOURCE_PREFIX,
          deleteBucket: true,
        }),
      },
    });
    const plan = reconciler.plan({
      mode: "sweep-only",
      scope: { resourcePrefix: RESOURCE_PREFIX, regions: [REGION], minAgeMinutes: 15 },
      targets: [target()],
    });

    const result = await reconciler.execute(plan, {
      confirmToken: plan.confirmToken,
      allow: ["deleteCloudResource"],
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.status).toBe("succeeded");
    expect(JSON.stringify(result)).not.toContain(BUCKET_NAME);
    expect(JSON.stringify(result)).not.toContain(OBJECT_KEY);
    expect(await bucketExists()).toBe(false);
  }, 180_000);
});

if (!enabled) {
  const missing = [
    RUN_INTEGRATION ? undefined : "HULUMI_INTEGRATION=1",
    RUN_RECONCILER_AWS ? undefined : "HULUMI_RECONCILER_AWS_INTEGRATION=1",
  ].filter((value): value is string => value !== undefined);

  describe("OrphanReconciler S3 real-AWS zero-orphan proof skip notice", () => {
    it.skip(`integration suite skipped; set ${missing.join(" and ")} plus sandbox AWS credentials`, () => {
      // intentionally empty
    });
  });
}
