import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { assertValidTier, type Tier } from "./tier";
import type {
  SecureIamDeploymentRoleArgs,
  SecureIamInlinePolicy,
  SecureIamOidcSubjectMode,
  SecureLaunchTemplateArgs,
  SecureSecretArgs,
  SecureSecretRotationPosture,
  SecureWorkloadRoleArgs,
} from "./secure-aws-primitives.args";
import type {
  SecureIamDeploymentRoleOutputs,
  SecureLaunchTemplateOutputs,
  SecureSecretOutputs,
  SecureWorkloadRoleOutputs,
} from "./secure-aws-primitives.outputs";

export const SECURE_IAM_DEPLOYMENT_ROLE_COMPONENT_TYPE =
  "hulumi:baseline:aws:SecureIamDeploymentRole";
export const SECURE_WORKLOAD_ROLE_COMPONENT_TYPE = "hulumi:baseline:aws:SecureWorkloadRole";
export const SECURE_SECRET_COMPONENT_TYPE = "hulumi:baseline:aws:SecureSecret";
export const SECURE_LAUNCH_TEMPLATE_COMPONENT_TYPE = "hulumi:baseline:aws:SecureLaunchTemplate";

export const MAX_SECURE_IAM_INLINE_POLICIES = 5;
export const MAX_SECURE_WORKLOAD_SERVICE_PRINCIPALS = 8;

const GITHUB_OIDC_ISSUER = "token.actions.githubusercontent.com";

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
}

function rejectWildcard(value: string, label: string): void {
  assertNonEmpty(value, label);
  if (value.includes("*")) throw new Error(`${label} must not contain a wildcard`);
}

function validateTierAndBoundary(
  component: string,
  tier: Tier,
  permissionBoundaryArn: unknown,
): void {
  assertValidTier(tier);
  if (tier === "startup-hardened" && permissionBoundaryArn === undefined) {
    throw new Error(`${component}: startup-hardened tier requires a permission boundary`);
  }
}

function validateInlinePolicies(policies: readonly SecureIamInlinePolicy[] | undefined): void {
  if ((policies ?? []).length > MAX_SECURE_IAM_INLINE_POLICIES) {
    throw new Error(
      `Secure IAM roles accept at most ${MAX_SECURE_IAM_INLINE_POLICIES} inline policies`,
    );
  }
  for (const policy of policies ?? []) {
    rejectWildcard(policy.name, "inline policy name");
  }
}

function policyToJson(
  policy: pulumi.Input<string | Record<string, unknown>>,
): pulumi.Input<string> {
  return pulumi
    .output(policy)
    .apply((value) => (typeof value === "string" ? value : JSON.stringify(value)));
}

function subjectClaim(args: SecureIamDeploymentRoleArgs): string {
  return args.subjectMode.kind === "environment"
    ? `repo:${args.owner}/${args.repository}:environment:${args.subjectMode.environment}`
    : `repo:${args.owner}/${args.repository}:ref:${args.subjectMode.ref}`;
}

function validateSubjectMode(subject: SecureIamOidcSubjectMode): void {
  if (subject.kind === "environment") {
    rejectWildcard(subject.environment, "environment");
    return;
  }
  rejectWildcard(subject.ref, "ref");
  if (subject.ref === "pull_request" || subject.ref === "pull_request_target") {
    throw new Error("ref must be a trusted refs/* value, not pull_request");
  }
  if (!subject.ref.startsWith("refs/")) {
    throw new Error("ref must be an exact refs/* value");
  }
}

function validateReusableWorkflowRef(ref: string | undefined, requireRef: boolean): void {
  if (ref === undefined) {
    if (requireRef) throw new Error("reusableWorkflowRef is required for environment subjects");
    return;
  }
  rejectWildcard(ref, "reusableWorkflowRef");
  if (!ref.includes("/.github/workflows/")) {
    throw new Error("reusableWorkflowRef must name a workflow file");
  }
  if (!ref.includes("@refs/")) {
    throw new Error("reusableWorkflowRef must use an exact refs/* ref");
  }
}

function deploymentTrustPolicy(args: SecureIamDeploymentRoleArgs): string {
  const stringEquals: Record<string, string> = {
    [`${GITHUB_OIDC_ISSUER}:aud`]: args.audience,
    [`${GITHUB_OIDC_ISSUER}:sub`]: subjectClaim(args),
  };
  if (args.reusableWorkflowRef !== undefined) {
    stringEquals[`${GITHUB_OIDC_ISSUER}:job_workflow_ref`] = args.reusableWorkflowRef;
  }
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

function validateDeploymentArgs(args: SecureIamDeploymentRoleArgs): void {
  validateTierAndBoundary("SecureIamDeploymentRole", args.tier, args.permissionBoundaryArn);
  rejectWildcard(args.owner, "owner");
  rejectWildcard(args.repository, "repository");
  rejectWildcard(args.audience, "audience");
  validateSubjectMode(args.subjectMode);
  validateReusableWorkflowRef(args.reusableWorkflowRef, args.subjectMode.kind === "environment");
  validateInlinePolicies(args.inlinePolicies);
}

function commonRoleArgs(
  roleName: pulumi.Input<string>,
  assumeRolePolicy: pulumi.Input<string>,
  tier: Tier,
  component: string,
  tags: Record<string, string> | undefined,
  permissionBoundaryArn: pulumi.Input<string> | undefined,
  path: pulumi.Input<string> | undefined,
): aws.iam.RoleArgs {
  return {
    name: roleName,
    assumeRolePolicy,
    ...(permissionBoundaryArn !== undefined ? { permissionsBoundary: permissionBoundaryArn } : {}),
    ...(path !== undefined ? { path } : {}),
    tags: {
      "hulumi:component": component,
      "hulumi:tier": tier,
      "hulumi:iac-role": "true",
      ...(tags ?? {}),
    },
  };
}

function attachPolicies(
  name: string,
  role: aws.iam.Role,
  policyArns: readonly pulumi.Input<string>[] | undefined,
  inlinePolicies: readonly SecureIamInlinePolicy[] | undefined,
  parent: pulumi.Resource,
): void {
  for (const [index, policyArn] of (policyArns ?? []).entries()) {
    new aws.iam.RolePolicyAttachment(
      `${name}-policy-${index}`,
      {
        role: role.name,
        policyArn,
      },
      { parent },
    );
  }
  for (const [index, policy] of (inlinePolicies ?? []).entries()) {
    new aws.iam.RolePolicy(
      `${name}-inline-${index}`,
      {
        role: role.name,
        name: policy.name,
        policy: policyToJson(policy.policy),
      },
      { parent },
    );
  }
}

export class SecureIamDeploymentRole
  extends pulumi.ComponentResource
  implements SecureIamDeploymentRoleOutputs
{
  public readonly roleArn: pulumi.Output<string>;
  public readonly roleName: pulumi.Output<string>;
  public readonly trustPolicySummary: pulumi.Output<Record<string, string>>;

  constructor(
    name: string,
    args: SecureIamDeploymentRoleArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    validateDeploymentArgs(args);
    super(SECURE_IAM_DEPLOYMENT_ROLE_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);

    const role = new aws.iam.Role(
      `${name}-role`,
      commonRoleArgs(
        args.roleName,
        deploymentTrustPolicy(args),
        args.tier,
        "SecureIamDeploymentRole",
        {
          "hulumi:github-repository": `${args.owner}/${args.repository}`,
          ...(args.subjectMode.kind === "environment"
            ? { "hulumi:github-environment": args.subjectMode.environment }
            : { "hulumi:github-ref": args.subjectMode.ref }),
          ...(args.tags ?? {}),
        },
        args.permissionBoundaryArn,
        args.path,
      ),
      { parent: this },
    );
    attachPolicies(name, role, args.policyArns, args.inlinePolicies, this);

    this.roleArn = role.arn;
    this.roleName = role.name;
    const summary: Record<string, string> = {
      repository: `${args.owner}/${args.repository}`,
      subject: subjectClaim(args),
      audience: args.audience,
      ...(args.reusableWorkflowRef !== undefined
        ? { reusableWorkflowRef: args.reusableWorkflowRef }
        : {}),
    };
    this.trustPolicySummary = pulumi.output(summary);

    this.registerOutputs({
      roleArn: this.roleArn,
      roleName: this.roleName,
      trustPolicySummary: this.trustPolicySummary,
    });
  }
}

function validateWorkloadArgs(args: SecureWorkloadRoleArgs): void {
  validateTierAndBoundary("SecureWorkloadRole", args.tier, args.permissionBoundaryArn);
  if (args.servicePrincipals.length === 0) {
    throw new Error("SecureWorkloadRole: servicePrincipals must be non-empty");
  }
  if (args.servicePrincipals.length > MAX_SECURE_WORKLOAD_SERVICE_PRINCIPALS) {
    throw new Error(
      `SecureWorkloadRole: servicePrincipals exceeds ${MAX_SECURE_WORKLOAD_SERVICE_PRINCIPALS}`,
    );
  }
  for (const principal of args.servicePrincipals) rejectWildcard(principal, "service principal");
  validateInlinePolicies(args.inlinePolicies);
}

function workloadTrustPolicy(servicePrincipals: readonly string[]): string {
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: servicePrincipals.length === 1 ? servicePrincipals[0] : servicePrincipals,
        },
        Action: "sts:AssumeRole",
      },
    ],
  });
}

export class SecureWorkloadRole
  extends pulumi.ComponentResource
  implements SecureWorkloadRoleOutputs
{
  public readonly roleArn: pulumi.Output<string>;
  public readonly roleName: pulumi.Output<string>;

  constructor(name: string, args: SecureWorkloadRoleArgs, opts?: pulumi.ComponentResourceOptions) {
    validateWorkloadArgs(args);
    super(SECURE_WORKLOAD_ROLE_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);

    const role = new aws.iam.Role(
      `${name}-role`,
      commonRoleArgs(
        args.roleName,
        workloadTrustPolicy(args.servicePrincipals),
        args.tier,
        "SecureWorkloadRole",
        args.tags,
        args.permissionBoundaryArn,
        args.path,
      ),
      { parent: this },
    );
    attachPolicies(name, role, args.policyArns, args.inlinePolicies, this);

    this.roleArn = role.arn;
    this.roleName = role.name;
    this.registerOutputs({ roleArn: this.roleArn, roleName: this.roleName });
  }
}

function policyHasBroadSecretAccess(policy: string | Record<string, unknown>): boolean {
  const doc = typeof policy === "string" ? (JSON.parse(policy) as Record<string, unknown>) : policy;
  const statements = Array.isArray(doc.Statement) ? doc.Statement : [doc.Statement];
  return statements.some((raw) => {
    if (raw === null || typeof raw !== "object") return false;
    const statement = raw as Record<string, unknown>;
    if (statement.Effect !== "Allow") return false;
    return valueIsBroad(statement.Principal) || valueIsBroad(statement.Resource);
  });
}

function valueIsBroad(value: unknown): boolean {
  if (value === "*") return true;
  if (Array.isArray(value)) return value.some(valueIsBroad);
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(valueIsBroad);
  }
  return false;
}

function validateSecretArgs(args: SecureSecretArgs): void {
  assertValidTier(args.tier);
  if (typeof args.secretName === "string") assertNonEmpty(args.secretName, "secretName");
  if (typeof args.kmsKeyId === "string") assertNonEmpty(args.kmsKeyId, "kmsKeyId");
  if (args.resourcePolicy !== undefined && policyHasBroadSecretAccess(args.resourcePolicy)) {
    throw new Error("SecureSecret: broad secret resource policy is not allowed");
  }
}

export class SecureSecret extends pulumi.ComponentResource implements SecureSecretOutputs {
  public readonly secretArn: pulumi.Output<string>;
  public readonly rotationPosture: pulumi.Output<SecureSecretRotationPosture>;

  constructor(name: string, args: SecureSecretArgs, opts?: pulumi.ComponentResourceOptions) {
    validateSecretArgs(args);
    super(SECURE_SECRET_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);

    const secret = new aws.secretsmanager.Secret(
      `${name}-secret`,
      {
        name: args.secretName,
        kmsKeyId: args.kmsKeyId,
        ...(args.description !== undefined ? { description: args.description } : {}),
        tags: {
          "hulumi:component": "SecureSecret",
          "hulumi:tier": args.tier,
          ...(args.tags ?? {}),
        },
      },
      { parent: this },
    );

    if (args.resourcePolicy !== undefined) {
      new aws.secretsmanager.SecretPolicy(
        `${name}-policy`,
        {
          secretArn: secret.arn,
          policy: policyToJson(args.resourcePolicy),
        },
        { parent: this },
      );
    }

    this.secretArn = secret.arn;
    this.rotationPosture = pulumi.output(
      args.rotation?.enabled === true ? "enabled" : "advisory-missing",
    );
    this.registerOutputs({
      secretArn: this.secretArn,
      rotationPosture: this.rotationPosture,
    });
  }
}

function validateLaunchTemplateArgs(args: SecureLaunchTemplateArgs): void {
  assertValidTier(args.tier);
  if (typeof args.namePrefix === "string") assertNonEmpty(args.namePrefix, "namePrefix");
  if (typeof args.imageId === "string") assertNonEmpty(args.imageId, "imageId");
  if (typeof args.instanceType === "string") assertNonEmpty(args.instanceType, "instanceType");
  if (
    args.metadataOptions?.httpTokens !== undefined &&
    args.metadataOptions.httpTokens !== "required"
  ) {
    throw new Error("SecureLaunchTemplate: IMDSv2 httpTokens must be required");
  }
}

export class SecureLaunchTemplate
  extends pulumi.ComponentResource
  implements SecureLaunchTemplateOutputs
{
  public readonly launchTemplateId: pulumi.Output<string>;
  public readonly launchTemplateArn: pulumi.Output<string>;

  constructor(
    name: string,
    args: SecureLaunchTemplateArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    validateLaunchTemplateArgs(args);
    super(SECURE_LAUNCH_TEMPLATE_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);

    const launchTemplate = new aws.ec2.LaunchTemplate(
      `${name}-launch-template`,
      {
        namePrefix: args.namePrefix,
        imageId: args.imageId,
        instanceType: args.instanceType,
        ...(args.userData !== undefined ? { userData: args.userData } : {}),
        metadataOptions: {
          httpEndpoint: "enabled",
          instanceMetadataTags: "disabled",
          ...(args.metadataOptions ?? {}),
          httpTokens: "required",
        },
        tags: {
          "hulumi:component": "SecureLaunchTemplate",
          "hulumi:tier": args.tier,
          ...(args.tags ?? {}),
        },
      },
      { parent: this },
    );

    this.launchTemplateId = launchTemplate.id;
    this.launchTemplateArn = launchTemplate.arn;
    this.registerOutputs({
      launchTemplateId: this.launchTemplateId,
      launchTemplateArn: this.launchTemplateArn,
    });
  }
}
