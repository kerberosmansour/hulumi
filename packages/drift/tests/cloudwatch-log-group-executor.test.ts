import { DeleteLogGroupCommand, DescribeLogGroupsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { describe, expect, it } from "vitest";

import { CloudWatchLogGroupExecutor } from "../src/adapters/cloudwatch-log-group";
import { OrphanReconciler, type ReconcilePlanAction } from "../src/reconciler";

class FakeLogsClient {
  readonly commands: unknown[] = [];
  constructor(private readonly behavior: "exists" | "absent" | "fails" = "exists") {}

  async send(command: unknown): Promise<Record<string, unknown>> {
    this.commands.push(command);
    if (this.behavior === "absent") {
      const err = new Error("ResourceNotFoundException");
      err.name = "ResourceNotFoundException";
      throw err;
    }
    if (this.behavior === "fails") {
      throw new Error("boom af-e2e-abc123-logs 123456789012");
    }
    if (command instanceof DescribeLogGroupsCommand) {
      return { logGroups: [{ logGroupName: "af-e2e-abc123-logs" }] };
    }
    return {};
  }
}

function action(logGroupName = "af-e2e-abc123-logs"): ReconcilePlanAction {
  return {
    id: "action-0000",
    type: "deleteCloudWatchLogGroup",
    resource: {
      provider: "aws",
      type: "aws:cloudwatch/logGroup:LogGroup",
      physicalId: logGroupName,
      region: "us-east-1",
      accountId: "123456789012",
    },
    recommendedAction: "deleteCloudResource",
    allowedActions: ["deleteCloudResource"],
    blockedActions: [],
    why: [],
    evidence: [],
    risk: "high",
    requiresApproval: true,
    stateMutation: false,
    cloudMutation: true,
    sensitiveFieldsRedacted: true,
    dependsOn: [],
    executable: true,
  };
}

describe("CloudWatchLogGroupExecutor", () => {
  it("deletes scoped log groups through explicit reconciler execution only", async () => {
    const client = new FakeLogsClient();
    const reconciler = new OrphanReconciler({
      executors: {
        deleteCloudWatchLogGroup: new CloudWatchLogGroupExecutor({
          client: client as never,
          expectedPrefix: "af-e2e-abc123",
        }),
      },
    });
    const plan = reconciler.plan({
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123", ownershipMinSignals: 2 },
      targets: [
        {
          inState: false,
          existsInCloud: true,
          identity: action().resource,
          ownership: [
            { signal: "name-prefix", subject: "af-e2e-abc123-logs", confidence: "high" },
            { signal: "tag", subject: "hulumi:component=AccountFoundation", confidence: "high" },
          ],
        },
      ],
    });

    expect(plan.actions[0]?.type).toBe("deleteCloudWatchLogGroup");
    expect(plan.actions[0]?.executable).toBe(true);

    const result = await reconciler.execute(plan, {
      confirmToken: plan.confirmToken,
      allow: ["deleteCloudResource"],
    });

    expect(client.commands.some((command) => command instanceof DescribeLogGroupsCommand)).toBe(
      true,
    );
    expect(client.commands.some((command) => command instanceof DeleteLogGroupCommand)).toBe(true);
    expect(result.results[0]).toEqual({
      actionId: plan.actions[0]?.id,
      status: "succeeded",
      counts: { deletedLogGroups: 1, alreadyAbsent: 0 },
    });
    expect(JSON.stringify(result)).not.toContain("af-e2e-abc123-logs");
    expect(JSON.stringify(result)).not.toContain("123456789012");
  });

  it("treats already absent log groups as idempotent success", async () => {
    const result = await new CloudWatchLogGroupExecutor({
      client: new FakeLogsClient("absent") as never,
      expectedPrefix: "af-e2e-abc123",
    }).execute(action());

    expect(result).toEqual({
      actionId: "action-0000",
      status: "succeeded",
      counts: { deletedLogGroups: 0, alreadyAbsent: 1 },
    });
  });

  it("blocks broad prefixes and wrong-prefix actions before SDK mutation", async () => {
    expect(
      () =>
        new CloudWatchLogGroupExecutor({
          client: new FakeLogsClient() as never,
          expectedPrefix: "*",
        }),
    ).toThrow(/broad/i);

    const client = new FakeLogsClient();
    const result = await new CloudWatchLogGroupExecutor({
      client: client as never,
      expectedPrefix: "af-e2e-abc123",
    }).execute(action("other-prefix-logs"));

    expect(result.status).toBe("blocked");
    expect(client.commands).toHaveLength(0);
  });

  it("returns redacted reconciler failure messages for SDK errors", async () => {
    const reconciler = new OrphanReconciler({
      executors: {
        deleteCloudWatchLogGroup: new CloudWatchLogGroupExecutor({
          client: new FakeLogsClient("fails") as never,
          expectedPrefix: "af-e2e-abc123",
        }),
      },
    });
    const plan = reconciler.plan({
      mode: "sweep-only",
      scope: { resourcePrefix: "af-e2e-abc123", ownershipMinSignals: 2 },
      targets: [
        {
          inState: false,
          existsInCloud: true,
          identity: action().resource,
          ownership: [
            { signal: "name-prefix", subject: "af-e2e-abc123-logs", confidence: "high" },
            { signal: "tag", subject: "hulumi:component=AccountFoundation", confidence: "high" },
          ],
        },
      ],
    });

    const result = await reconciler.execute(plan, {
      confirmToken: plan.confirmToken,
      allow: ["deleteCloudResource"],
    });

    expect(result.results[0]?.status).toBe("failed");
    expect(result.results[0]?.message).toBe(
      "Error: executor failed; see local logs for redacted details",
    );
    expect(JSON.stringify(result)).not.toContain("af-e2e-abc123-logs");
    expect(JSON.stringify(result)).not.toContain("123456789012");
  });
});
