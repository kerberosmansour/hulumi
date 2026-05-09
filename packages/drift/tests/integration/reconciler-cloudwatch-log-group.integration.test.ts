// Real-AWS integration proof for the guarded CloudWatch Logs reconciler primitive.
//
// This suite is intentionally double-gated:
// - HULUMI_INTEGRATION=1 follows the repo-wide integration convention.
// - HULUMI_RECONCILER_AWS_INTEGRATION=1 opts into live AWS mutations.
//
// Without both flags and a sandbox AWS identity, the file contributes only a
// visible skip notice. With both flags, it creates one scoped log group, proves
// plan mode does not mutate it, executes the CloudWatch log group executor, and
// verifies the log group is absent. Cleanup runs after all cases.

import { randomUUID } from "node:crypto";

import {
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
  CloudWatchLogsClient,
} from "@aws-sdk/client-cloudwatch-logs";
import { afterAll, describe, expect, it } from "vitest";

import { CloudWatchLogGroupExecutor } from "../../src/adapters/cloudwatch-log-group";
import {
  OrphanReconciler,
  type ReconcileActionExecutor,
  type ReconcilePlanAction,
} from "../../src/reconciler";

const RUN_INTEGRATION = process.env.HULUMI_INTEGRATION === "1";
const RUN_RECONCILER_AWS = process.env.HULUMI_RECONCILER_AWS_INTEGRATION === "1";
const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
const TEST_ID = randomUUID().replace(/-/g, "").slice(0, 10);
const RESOURCE_PREFIX = `hulumi-drift-e2e-${TEST_ID}`;
const LOG_GROUP_NAME = `${RESOURCE_PREFIX}-logs`;
const enabled = RUN_INTEGRATION && RUN_RECONCILER_AWS;
const logs = new CloudWatchLogsClient({ region: REGION });

async function logGroupExists(): Promise<boolean> {
  return (await listInScopeLogGroups()).includes(LOG_GROUP_NAME);
}

async function listInScopeLogGroups(): Promise<string[]> {
  const result = await logs.send(
    new DescribeLogGroupsCommand({ logGroupNamePrefix: RESOURCE_PREFIX, limit: 50 }),
  );
  return (result.logGroups ?? [])
    .map((group) => group.logGroupName)
    .filter((name): name is string => name !== undefined && name.startsWith(RESOURCE_PREFIX));
}

async function cleanupLogGroup(): Promise<void> {
  const names = await listInScopeLogGroups();
  for (const name of names) {
    try {
      await logs.send(new DeleteLogGroupCommand({ logGroupName: name }));
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  return (
    err instanceof Error && /ResourceNotFoundException|NotFound|404/i.test(err.name + err.message)
  );
}

function target(ownershipSignals = 2) {
  return {
    inState: false,
    existsInCloud: true,
    identity: {
      provider: "aws" as const,
      type: "aws:cloudwatch/logGroup:LogGroup",
      physicalId: LOG_GROUP_NAME,
      region: REGION,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    ownership:
      ownershipSignals >= 2
        ? [
            {
              signal: "name-prefix" as const,
              subject: LOG_GROUP_NAME,
              confidence: "high" as const,
            },
            {
              signal: "caller" as const,
              subject: "hulumi-reconciler-integration",
              confidence: "high" as const,
            },
          ]
        : [
            {
              signal: "name-prefix" as const,
              subject: LOG_GROUP_NAME,
              confidence: "high" as const,
            },
          ],
  };
}

function singletonTarget(type: string, physicalId: string) {
  return {
    inState: false,
    existsInCloud: true,
    identity: {
      provider: "aws" as const,
      type,
      physicalId,
      region: REGION,
      singleton: true,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    ownership: [
      { signal: "name-prefix" as const, subject: physicalId, confidence: "high" as const },
      {
        signal: "caller" as const,
        subject: "hulumi-reconciler-integration",
        confidence: "high" as const,
      },
    ],
  };
}

class FailingBeforeDeleteExecutor implements ReconcileActionExecutor {
  async execute(action: ReconcilePlanAction) {
    if (action.resource.physicalId !== undefined) {
      const exists = await logGroupExists();
      if (exists) throw new Error("injected pre-delete failure");
    }
    return { actionId: action.id, status: "blocked" as const };
  }
}

describe.skipIf(!enabled)("OrphanReconciler CloudWatch Logs real-AWS zero-orphan proof", () => {
  afterAll(async () => {
    await cleanupLogGroup();
    expect(await listInScopeLogGroups()).toEqual([]);
  }, 60_000);

  it("blocks weak evidence, preserves dry-run, recovers from failure, and verifies zero in-scope resources", async () => {
    await cleanupLogGroup();
    await logs.send(new CreateLogGroupCommand({ logGroupName: LOG_GROUP_NAME }));

    const dryRun = new OrphanReconciler().plan({
      mode: "plan",
      scope: { resourcePrefix: RESOURCE_PREFIX, regions: [REGION], minAgeMinutes: 15 },
      targets: [target()],
    });
    expect(dryRun.executable).toBe(false);
    expect(await logGroupExists()).toBe(true);
    expect(JSON.stringify(dryRun)).not.toContain(LOG_GROUP_NAME);

    const weakEvidence = new OrphanReconciler().plan({
      mode: "sweep-only",
      scope: { resourcePrefix: RESOURCE_PREFIX, regions: [REGION], ownershipMinSignals: 2 },
      targets: [target(1)],
    });
    expect(weakEvidence.executable).toBe(false);
    expect(weakEvidence.actions[0]?.blockedActions.map((blocked) => blocked.reason)).toContain(
      "insufficient ownership evidence",
    );
    expect(await logGroupExists()).toBe(true);

    const singletonPlan = new OrphanReconciler().plan({
      mode: "sweep-only",
      scope: { resourcePrefix: RESOURCE_PREFIX, regions: [REGION], ownershipMinSignals: 2 },
      targets: [
        singletonTarget("aws:guardduty/detector:Detector", `${RESOURCE_PREFIX}-guardduty`),
        singletonTarget("aws:securityhub/account:Account", `${RESOURCE_PREFIX}-securityhub`),
      ],
    });
    expect(singletonPlan.actions).toHaveLength(2);
    expect(singletonPlan.actions.every((action) => action.type === "retainSharedSingleton")).toBe(
      true,
    );
    expect(
      singletonPlan.actions.every(
        (action) => action.recommendedAction === "retainExternal" && !action.cloudMutation,
      ),
    ).toBe(true);

    const failingReconciler = new OrphanReconciler({
      executors: {
        deleteCloudWatchLogGroup: new FailingBeforeDeleteExecutor(),
      },
    });
    const failingPlan = failingReconciler.plan({
      mode: "sweep-only",
      scope: { resourcePrefix: RESOURCE_PREFIX, regions: [REGION], minAgeMinutes: 15 },
      targets: [target()],
    });
    const failed = await failingReconciler.execute(failingPlan, {
      confirmToken: failingPlan.confirmToken,
      allow: ["deleteCloudResource"],
    });
    expect(failed.results[0]?.status).toBe("failed");
    expect(failed.results[0]?.message).toBe(
      "Error: executor failed; see local logs for redacted details",
    );
    expect(JSON.stringify(failed)).not.toContain(LOG_GROUP_NAME);
    expect(await logGroupExists()).toBe(true);

    const reconciler = new OrphanReconciler({
      executors: {
        deleteCloudWatchLogGroup: new CloudWatchLogGroupExecutor({
          client: logs,
          expectedPrefix: RESOURCE_PREFIX,
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
    expect(JSON.stringify(result)).not.toContain(LOG_GROUP_NAME);
    expect(await listInScopeLogGroups()).toEqual([]);
  }, 90_000);
});

if (!enabled) {
  const missing = [
    RUN_INTEGRATION ? undefined : "HULUMI_INTEGRATION=1",
    RUN_RECONCILER_AWS ? undefined : "HULUMI_RECONCILER_AWS_INTEGRATION=1",
  ].filter((value): value is string => value !== undefined);

  describe("OrphanReconciler CloudWatch Logs real-AWS zero-orphan proof skip notice", () => {
    it.skip(`integration suite skipped; set ${missing.join(" and ")} plus sandbox AWS credentials`, () => {
      // intentionally empty
    });
  });
}
