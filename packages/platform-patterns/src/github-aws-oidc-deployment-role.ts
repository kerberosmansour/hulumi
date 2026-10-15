import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type {
  GitHubAwsOidcDeploymentRoleArgs,
  GitHubAwsOidcSubjectMode,
} from "./github-aws-oidc-deployment-role.args";
import type { GitHubAwsOidcDeploymentRoleOutputs } from "./github-aws-oidc-deployment-role.outputs";
import { assertValidTier } from "./tier";

export const GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_COMPONENT_TYPE =
  "hulumi:platform:GitHubAwsOidcDeploymentRole";
const GITHUB_REUSABLE_WORKFLOW_REF_PATTERN =
  /^[^/:\s]+\/[^/:\s]+\/\.github\/workflows\/[^@:\s]+@refs\/(?:heads|tags)\/[^@:*?\s]+$/u;

function rejectWildcard(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`GitHubAwsOidcDeploymentRole: ${label} must be non-empty`);
  }
  if (value.includes("*")) {
    throw new Error(`GitHubAwsOidcDeploymentRole: wildcard not allowed in ${label}`);
  }
}

// Resolve the effective subject mode: explicit `subjectMode`, else the
// legacy flat `environment` field (back-compat), else an error.
function resolveSubjectMode(args: GitHubAwsOidcDeploymentRoleArgs): GitHubAwsOidcSubjectMode {
  if (args.subjectMode !== undefined) return args.subjectMode;
  if (typeof args.environment === "string" && args.environment.trim().length > 0) {
    return { kind: "environment", environment: args.environment };
  }
  throw new Error(
    "GitHubAwsOidcDeploymentRole: provide `subjectMode` (environment | ref) or the legacy `environment` field",
  );
}

function validateReusableWorkflowRef(ref: string | undefined): string {
  if (ref === undefined) {
    throw new Error(
      "GitHubAwsOidcDeploymentRole: reusableWorkflowRef is required for every subject mode",
    );
  }
  rejectWildcard(ref, "reusableWorkflowRef");
  if (!GITHUB_REUSABLE_WORKFLOW_REF_PATTERN.test(ref)) {
    throw new Error(
      "GitHubAwsOidcDeploymentRole: reusableWorkflowRef must name one OWNER/REPOSITORY/.github/workflows/FILE at an exact branch or tag refs/* ref",
    );
  }
  return ref;
}

function validateArgs(
  args: GitHubAwsOidcDeploymentRoleArgs,
  subject: GitHubAwsOidcSubjectMode,
): string {
  rejectWildcard(args.owner, "owner");
  rejectWildcard(args.repository, "repository");
  rejectWildcard(args.audience, "audience");
  if (typeof args.oidcProviderArn === "string" && args.oidcProviderArn.trim().length === 0) {
    throw new Error("GitHubAwsOidcDeploymentRole: oidcProviderArn must be non-empty");
  }
  if (subject.kind === "environment") {
    rejectWildcard(subject.environment, "environment");
  } else {
    rejectWildcard(subject.ref, "ref");
    if (subject.ref === "pull_request" || subject.ref === "pull_request_target") {
      throw new Error(
        "GitHubAwsOidcDeploymentRole: pull_request / pull_request_target subjects are not allowed — use a trusted-trigger ref (refs/heads/main or a pinned tag)",
      );
    }
    if (!subject.ref.startsWith("refs/")) {
      throw new Error(
        "GitHubAwsOidcDeploymentRole: ref must be an exact refs/* ref (e.g. refs/heads/main or refs/tags/v1.2.3)",
      );
    }
  }
  return validateReusableWorkflowRef(args.reusableWorkflowRef);
}

function subjectClaim(
  args: GitHubAwsOidcDeploymentRoleArgs,
  subject: GitHubAwsOidcSubjectMode,
  workflowRef: string,
): string {
  const context =
    subject.kind === "environment" ? `environment:${subject.environment}` : `ref:${subject.ref}`;
  return `repo:${args.owner}/${args.repository}:${context}:job_workflow_ref:${workflowRef}`;
}

function trustPolicy(
  args: GitHubAwsOidcDeploymentRoleArgs,
  subject: GitHubAwsOidcSubjectMode,
  workflowRef: string,
): string {
  const stringEquals: Record<string, string> = {
    "token.actions.githubusercontent.com:aud": args.audience,
    "token.actions.githubusercontent.com:sub": subjectClaim(args, subject, workflowRef),
  };
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Federated: args.oidcProviderArn },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: { StringEquals: stringEquals },
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
    const subject = resolveSubjectMode(args);
    const workflowRef = validateArgs(args, subject);

    const subjectTag =
      subject.kind === "environment"
        ? { "hulumi:github-environment": subject.environment }
        : { "hulumi:github-ref": subject.ref };
    const roleArgs: aws.iam.RoleArgs = {
      name: args.roleName,
      assumeRolePolicy: trustPolicy(args, subject, workflowRef),
      ...(args.path !== undefined ? { path: args.path } : {}),
      tags: {
        "hulumi:component": "GitHubAwsOidcDeploymentRole",
        "hulumi:tier": args.tier,
        "hulumi:github-repository": `${args.owner}/${args.repository}`,
        ...subjectTag,
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
      subject: subjectClaim(args, subject, workflowRef),
      audience: args.audience,
      ...(subject.kind === "environment"
        ? { environment: subject.environment }
        : { ref: subject.ref }),
      reusableWorkflowRef: workflowRef,
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
