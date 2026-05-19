import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
  type CloudWatchLogsClientConfig,
} from "@aws-sdk/client-cloudwatch-logs";
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";

import type {
  ReconcileActionExecutor,
  ReconcileActionResult,
  ReconcilePlanAction,
} from "../reconciler";

export interface CloudWatchLogGroupExecutorArgs {
  client?: CloudWatchLogsClient;
  clientConfig?: CloudWatchLogsClientConfig;
  stsClient?: STSClient;
  expectedPrefix: string;
}

export class CloudWatchLogGroupExecutor implements ReconcileActionExecutor {
  private readonly client: CloudWatchLogsClient;
  private readonly stsClient: STSClient;
  private readonly expectedPrefix: string;
  private resolvedAccountId?: string;

  constructor(args: CloudWatchLogGroupExecutorArgs) {
    if (args.expectedPrefix.trim().length < 6 || /[*?]/.test(args.expectedPrefix)) {
      throw new Error("Refusing broad CloudWatch Logs cleanup prefix.");
    }
    this.client = args.client ?? new CloudWatchLogsClient(args.clientConfig ?? {});
    this.stsClient =
      args.stsClient ??
      new STSClient(
        args.clientConfig?.region !== undefined ? { region: args.clientConfig.region } : {},
      );
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

    const placementBlock = await this.blockOnPlacementMismatch(action);
    if (placementBlock !== undefined) {
      return placementBlock;
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

  // Fail-closed binding: the configured client must operate in the same
  // account and region the action's resource was discovered in. A mis-wired
  // (prod creds / wrong region) client must never delete a same-name log
  // group that belongs to an unrelated placement.
  private async blockOnPlacementMismatch(
    action: ReconcilePlanAction,
  ): Promise<ReconcileActionResult | undefined> {
    const expectedAccountId = action.resource.accountId;
    const expectedRegion = action.resource.region;
    if (expectedAccountId === undefined || expectedRegion === undefined) {
      return {
        actionId: action.id,
        status: "blocked",
        message: "resource account or region is unknown; refusing to delete on unknown placement",
      };
    }

    let resolvedAccountId: string;
    let resolvedRegion: string;
    try {
      resolvedAccountId = await this.resolveAccountId();
      resolvedRegion = await this.client.config.region();
    } catch {
      return {
        actionId: action.id,
        status: "blocked",
        message: "could not resolve client account or region; refusing to delete",
      };
    }

    if (resolvedAccountId !== expectedAccountId) {
      return {
        actionId: action.id,
        status: "blocked",
        message: "client account does not match the resource account",
      };
    }
    if (resolvedRegion !== expectedRegion) {
      return {
        actionId: action.id,
        status: "blocked",
        message: "client region does not match the resource region",
      };
    }
    return undefined;
  }

  private async resolveAccountId(): Promise<string> {
    if (this.resolvedAccountId !== undefined) return this.resolvedAccountId;
    const identity = await this.stsClient.send(new GetCallerIdentityCommand({}));
    if (identity.Account === undefined || identity.Account.length === 0) {
      throw new Error("STS GetCallerIdentity returned no account");
    }
    this.resolvedAccountId = identity.Account;
    return this.resolvedAccountId;
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
