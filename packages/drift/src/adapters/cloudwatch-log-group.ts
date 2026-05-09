import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
  type CloudWatchLogsClientConfig,
} from "@aws-sdk/client-cloudwatch-logs";

import type {
  ReconcileActionExecutor,
  ReconcileActionResult,
  ReconcilePlanAction,
} from "../reconciler";

export interface CloudWatchLogGroupExecutorArgs {
  client?: CloudWatchLogsClient;
  clientConfig?: CloudWatchLogsClientConfig;
  expectedPrefix: string;
}

export class CloudWatchLogGroupExecutor implements ReconcileActionExecutor {
  private readonly client: CloudWatchLogsClient;
  private readonly expectedPrefix: string;

  constructor(args: CloudWatchLogGroupExecutorArgs) {
    if (args.expectedPrefix.trim().length < 6 || /[*?]/.test(args.expectedPrefix)) {
      throw new Error("Refusing broad CloudWatch Logs cleanup prefix.");
    }
    this.client = args.client ?? new CloudWatchLogsClient(args.clientConfig ?? {});
    this.expectedPrefix = args.expectedPrefix;
  }

  async execute(action: ReconcilePlanAction): Promise<ReconcileActionResult> {
    const logGroupName = action.resource.physicalId;
    if (logGroupName === undefined || !logGroupName.startsWith(this.expectedPrefix)) {
      return {
        actionId: action.id,
        status: "blocked",
        message: "log group name missing or outside expected prefix",
      };
    }
    if (
      action.type !== "deleteCloudWatchLogGroup" ||
      action.recommendedAction !== "deleteCloudResource"
    ) {
      return {
        actionId: action.id,
        status: "blocked",
        message: "action is not a CloudWatch log group delete",
      };
    }

    try {
      if (!(await this.logGroupExists(logGroupName))) {
        return {
          actionId: action.id,
          status: "succeeded",
          counts: { deletedLogGroups: 0, alreadyAbsent: 1 },
        };
      }
      await this.client.send(new DeleteLogGroupCommand({ logGroupName }));
      return {
        actionId: action.id,
        status: "succeeded",
        counts: { deletedLogGroups: 1, alreadyAbsent: 0 },
      };
    } catch (err) {
      if (isAwsNotFound(err)) {
        return {
          actionId: action.id,
          status: "succeeded",
          counts: { deletedLogGroups: 0, alreadyAbsent: 1 },
        };
      }
      throw err;
    }
  }

  private async logGroupExists(logGroupName: string): Promise<boolean> {
    const result = await this.client.send(
      new DescribeLogGroupsCommand({ logGroupNamePrefix: logGroupName, limit: 1 }),
    );
    return result.logGroups?.some((group) => group.logGroupName === logGroupName) ?? false;
  }
}

function isAwsNotFound(err: unknown): boolean {
  return (
    err instanceof Error && /ResourceNotFoundException|NotFound|404/i.test(err.name + err.message)
  );
}
