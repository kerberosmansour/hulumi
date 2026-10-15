import type * as pulumi from "@pulumi/pulumi";
import type * as github from "@pulumi/github";
import type { Tier } from "./tier";

/** Configuration for an isolated CodeBuild-hosted GitHub runner project. */
export interface CodeBuildGitHubRunnerArgs {
  readonly tier: Tier;
  readonly owner: string;
  readonly repository: string;
  readonly projectName: string;
  /** Operator-established account/region OAuth source connection; never imported here. */
  readonly sourceAuthentication: "existing-account-oauth";
  /** Credentials for an internally owner/API-bound provider; omitted uses provider environment. */
  readonly githubAuth?: Pick<github.ProviderArgs, "token" | "appAuth">;
  readonly architecture?: "arm64" | "x86_64";
  readonly instanceSize?: "small" | "medium" | "large";
  readonly buildTimeoutMinutes?: number;
  readonly queuedTimeoutMinutes?: number;
  readonly concurrentBuildLimit?: number;
  readonly logRetentionDays?: 7 | 14 | 30;
  /** Explicit risk expansion; independently flagged by the dedicated policy pack. */
  readonly privilegedMode?: boolean;
  /** Explicit network authority; policy review/suppression is required. */
  readonly vpc?: {
    readonly vpcId: pulumi.Input<string>;
    readonly subnetIds: readonly pulumi.Input<string>[];
    readonly securityGroupIds: readonly pulumi.Input<string>[];
  };
  readonly repositoryVariableName?: string;
}
