import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export type DeploymentEnvironmentName = "dev" | "staging" | "prod";

export interface DeploymentEnvironmentConfig {
  readonly name: DeploymentEnvironmentName;
  readonly requiredReviewerUserIds?: readonly pulumi.Input<number>[];
  readonly requiredReviewerTeamIds?: readonly pulumi.Input<number>[];
  readonly protectedBranches: boolean;
  readonly customBranchPolicies: boolean;
  readonly variables?: Readonly<Record<string, pulumi.Input<string>>>;
  readonly secretReferences?: readonly string[];
}

export interface DeploymentRepositoryFoundationArgs {
  readonly tier: Tier;
  readonly name: string;
  readonly owner: string;
  readonly visibility?: "private" | "internal";
  readonly environments?: readonly DeploymentEnvironmentConfig[];
  readonly provenance?: boolean;
}
