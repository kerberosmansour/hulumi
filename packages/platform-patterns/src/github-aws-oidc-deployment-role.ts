import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { GitHubAwsOidcDeploymentRoleArgs } from "./github-aws-oidc-deployment-role.args";
import type { GitHubAwsOidcDeploymentRoleOutputs } from "./github-aws-oidc-deployment-role.outputs";
import { assertValidTier } from "./tier";

export const GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_COMPONENT_TYPE =
  "hulumi:platform:GitHubAwsOidcDeploymentRole";

function rejectWildcard(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`GitHubAwsOidcDeploymentRole: ${label} must be non-empty`);
  }
  if (value.includes("*")) {
    throw new Error(`GitHubAwsOidcDeploymentRole: wildcard not allowed in ${label}`);
  }
}

function validateArgs(args: GitHubAwsOidcDeploymentRoleArgs): void {
  rejectWildcard(args.owner, "owner");
  rejectWildcard(args.repository, "repository");
  rejectWildcard(args.environment, "environment");
  rejectWildcard(args.reusableWorkflowRef, "reusableWorkflowRef");
  rejectWildcard(args.audience, "audience");
  if (!args.reusableWorkflowRef.includes("/.github/workflows/")) {
    throw new Error("GitHubAwsOidcDeploymentRole: reusableWorkflowRef must name a workflow file");
  }
  if (!args.reusableWorkflowRef.includes("@refs/")) {
    throw new Error(
      "GitHubAwsOidcDeploymentRole: reusableWorkflowRef must use an exact refs/* ref",
    );
  }
  if (typeof args.oidcProviderArn === "string" && args.oidcProviderArn.trim().length === 0) {
    throw new Error("GitHubAwsOidcDeploymentRole: oidcProviderArn must be non-empty");
  }
}

function trustPolicy(args: GitHubAwsOidcDeploymentRoleArgs): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Federated: args.oidcProviderArn },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            "token.actions.githubusercontent.com:aud": args.audience,
            "token.actions.githubusercontent.com:sub": `repo:${args.owner}/${args.repository}:environment:${args.environment}`,
            "token.actions.githubusercontent.com:job_workflow_ref": args.reusableWorkflowRef,
          },
        },
      },
    ],
  });
}

export class GitHubAwsOidcDeploymentRole
  extends pulumi.ComponentResource
  implements GitHubAwsOidcDeploymentRoleOutputs
{
  public readonly roleArn: pulumi.Output<string>;
  public readonly roleName: pulumi.Output<string>;
  public readonly trustPolicySummary: pulumi.Output<Record<string, string>>;
  public readonly githubActionsUsageBlock: pulumi.Output<string>;

  constructor(
    name: string,
    args: GitHubAwsOidcDeploymentRoleArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    validateArgs(args);

    const roleArgs: aws.iam.RoleArgs = {
      name: args.roleName,
      assumeRolePolicy: trustPolicy(args),
      ...(args.path !== undefined ? { path: args.path } : {}),
      tags: {
        "hulumi:component": "GitHubAwsOidcDeploymentRole",
        "hulumi:tier": args.tier,
        "hulumi:github-repository": `${args.owner}/${args.repository}`,
        "hulumi:github-environment": args.environment,
      },
    };
    const role = new aws.iam.Role(`${name}-role`, roleArgs, { parent: this });

    for (const [index, policyArn] of (args.policyArns ?? []).entries()) {
      new aws.iam.RolePolicyAttachment(
        `${name}-policy-${index}`,
        {
          role: role.name,
          policyArn,
        },
        { parent: this },
      );
    }

    const summary: Record<string, string> = {
      repository: `${args.owner}/${args.repository}`,
      environment: args.environment,
      reusableWorkflowRef: args.reusableWorkflowRef,
      audience: args.audience,
    };

    this.roleArn = role.arn;
    this.roleName = role.name;
    this.trustPolicySummary = pulumi.output(summary);
    this.githubActionsUsageBlock = role.arn.apply(
      (arn) => `permissions:
  id-token: write
  contents: read
steps:
  - uses: aws-actions/configure-aws-credentials@<FULL_LENGTH_SHA_PIN>
    with:
      role-to-assume: ${arn}
      aws-region: eu-west-2`,
    );

    this.registerOutputs({
      roleArn: this.roleArn,
      roleName: this.roleName,
      trustPolicySummary: this.trustPolicySummary,
      githubActionsUsageBlock: this.githubActionsUsageBlock,
    });
  }
}
