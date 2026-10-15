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
  /**
   * At least one unique environment is required. The component marks its
   * repository as deployment-capable, so DEPLOY_GOV_1 can require the
   * corresponding protected-environment and OIDC authority tuple.
   */
  readonly environments: readonly DeploymentEnvironmentConfig[];
  readonly provenance?: boolean;
}
