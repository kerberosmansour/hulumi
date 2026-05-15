import type * as pulumi from "@pulumi/pulumi";

export interface GitHubAwsOidcDeploymentRoleOutputs {
  readonly roleArn: pulumi.Output<string>;
  readonly roleName: pulumi.Output<string>;
  readonly trustPolicySummary: pulumi.Output<Record<string, string>>;
  readonly githubActionsUsageBlock: pulumi.Output<string>;
}
