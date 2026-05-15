import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export interface GitHubAwsOidcDeploymentRoleArgs {
  readonly tier: Tier;
  readonly owner: string;
  readonly repository: string;
  readonly environment: string;
  readonly reusableWorkflowRef: string;
  readonly audience: string;
  readonly roleName: pulumi.Input<string>;
  readonly oidcProviderArn: pulumi.Input<string>;
  readonly policyArns?: readonly pulumi.Input<string>[];
  readonly path?: pulumi.Input<string>;
}
