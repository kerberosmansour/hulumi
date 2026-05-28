import type { Tier } from "./tier";

export type RunnerGovernanceEnvironmentName = "dev" | "staging" | "prod" | (string & {});

export interface RunnerGovernanceEnvironmentConfig {
  readonly name: RunnerGovernanceEnvironmentName;
  readonly requiredReviewers?: boolean;
  readonly protectedBranches?: boolean;
  readonly customBranchPolicies?: boolean;
}

export interface RunnerGovernancePrivilegedWorkflow {
  readonly workflowPath: string;
  readonly jobName: string;
  readonly environmentName: RunnerGovernanceEnvironmentName;
  readonly runsOn: readonly string[];
  readonly oidcRequired?: boolean;
  readonly longLivedCloudSecretNames?: readonly string[];
}

export interface RunnerGovernanceFoundationArgs {
  readonly tier: Tier;
  readonly owner: string;
  readonly repository: string;
  readonly environments: readonly RunnerGovernanceEnvironmentConfig[];
  readonly privilegedWorkflows?: readonly RunnerGovernancePrivilegedWorkflow[];
  readonly approvedSelfHostedRunnerLabels?: readonly string[];
  readonly runnerPageCap?: number;
}
