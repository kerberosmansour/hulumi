import * as pulumi from "@pulumi/pulumi";

import type {
  RunnerGovernanceEnvironmentConfig,
  RunnerGovernanceFoundationArgs,
  RunnerGovernancePrivilegedWorkflow,
} from "./runner-governance-foundation.args";
import type {
  RunnerGovernanceFoundationOutputs,
  RunnerGovernanceSelfHostedRunnerPolicy,
  RunnerGovernanceValidatorCheck,
} from "./runner-governance-foundation.outputs";
import { assertValidTier } from "./tier";

export const RUNNER_GOVERNANCE_FOUNDATION_COMPONENT_TYPE =
  "hulumi:platform:RunnerGovernanceFoundation";

const MAX_APPROVED_SELF_HOSTED_LABELS = 16;
const DEFAULT_RUNNER_PAGE_CAP = 100;
const MAX_RUNNER_PAGE_CAP = 1_000;
const LONG_LIVED_CLOUD_SECRET_NAMES = new Set([
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_ACCESS_KEY",
  "AZURE_CLIENT_SECRET",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GCP_SERVICE_ACCOUNT_KEY",
]);

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`RunnerGovernanceFoundation: ${label} must be non-empty`);
  }
  if (trimmed.includes("*")) {
    throw new Error(`RunnerGovernanceFoundation: wildcard not allowed in ${label}`);
  }
  return trimmed;
}

function normalizeLabel(label: string): string {
  return requireNonEmpty(label, "runner label").toLowerCase();
}

function normalizeLabels(labels: readonly string[] | undefined): string[] {
  const normalized = Array.from(new Set((labels ?? []).map(normalizeLabel))).sort();
  if (normalized.length > MAX_APPROVED_SELF_HOSTED_LABELS) {
    throw new Error(
      `RunnerGovernanceFoundation: approvedSelfHostedRunnerLabels must contain at most ${MAX_APPROVED_SELF_HOSTED_LABELS} entries`,
    );
  }
  return normalized;
}

function hasReviewerProtection(env: RunnerGovernanceEnvironmentConfig): boolean {
  return env.requiredReviewers === true;
}

function hasBranchPolicy(env: RunnerGovernanceEnvironmentConfig): boolean {
  return env.protectedBranches === true || env.customBranchPolicies === true;
}

function validateEnvironment(
  env: RunnerGovernanceEnvironmentConfig,
): RunnerGovernanceEnvironmentConfig {
  const name = requireNonEmpty(env.name, "environment name");
  if (name === "prod") {
    if (!hasReviewerProtection(env)) {
      throw new Error("RunnerGovernanceFoundation: prod environment requires reviewer protection");
    }
    if (!hasBranchPolicy(env)) {
      throw new Error("RunnerGovernanceFoundation: prod environment requires branch policy");
    }
  }
  return {
    ...env,
    name,
    requiredReviewers: env.requiredReviewers === true,
    protectedBranches: env.protectedBranches === true,
    customBranchPolicies: env.customBranchPolicies === true,
  };
}

function selfHostedLabels(runsOn: readonly string[]): string[] {
  const labels = runsOn.map(normalizeLabel);
  return labels.includes("self-hosted") ? labels.filter((label) => label !== "self-hosted") : [];
}

function validateWorkflow(
  workflow: RunnerGovernancePrivilegedWorkflow,
  environmentNames: ReadonlySet<string>,
  approvedSelfHostedLabels: ReadonlySet<string>,
): RunnerGovernancePrivilegedWorkflow {
  const workflowPath = requireNonEmpty(workflow.workflowPath, "workflowPath");
  const jobName = requireNonEmpty(workflow.jobName, "jobName");
  const environmentName = requireNonEmpty(workflow.environmentName, "environmentName");
  if (!environmentNames.has(environmentName)) {
    throw new Error(
      `RunnerGovernanceFoundation: workflow ${workflowPath}#${jobName} references unknown environment ${environmentName}`,
    );
  }
  const runsOn = workflow.runsOn.map(normalizeLabel);
  if (runsOn.length === 0) {
    throw new Error(`RunnerGovernanceFoundation: workflow ${workflowPath}#${jobName} needs runsOn`);
  }
  if (workflow.oidcRequired === false) {
    throw new Error(
      `RunnerGovernanceFoundation: workflow ${workflowPath}#${jobName} must require OIDC for cloud deployment`,
    );
  }
  const secretNames = [...(workflow.longLivedCloudSecretNames ?? [])].map((secret) =>
    requireNonEmpty(secret, "longLivedCloudSecretNames entry").toUpperCase(),
  );
  const longLivedSecrets = secretNames.filter((secret) =>
    LONG_LIVED_CLOUD_SECRET_NAMES.has(secret),
  );
  if (longLivedSecrets.length > 0) {
    throw new Error(
      `RunnerGovernanceFoundation: workflow ${workflowPath}#${jobName} declares long-lived cloud secret names; use OIDC instead`,
    );
  }
  const labels = selfHostedLabels(runsOn);
  if (labels.length > 0) {
    if (approvedSelfHostedLabels.size === 0) {
      throw new Error(
        `RunnerGovernanceFoundation: self-hosted runner usage in ${workflowPath}#${jobName} is blocked by default`,
      );
    }
    const unapproved = labels.filter((label) => !approvedSelfHostedLabels.has(label));
    if (unapproved.length > 0) {
      throw new Error(
        `RunnerGovernanceFoundation: self-hosted runner labels for ${workflowPath}#${jobName} are not approved: ${unapproved.join(", ")}`,
      );
    }
  }
  return {
    ...workflow,
    workflowPath,
    jobName,
    environmentName,
    runsOn,
    oidcRequired: workflow.oidcRequired ?? true,
    longLivedCloudSecretNames: secretNames,
  };
}

function validatePageCap(value: number | undefined): number {
  const pageCap = value ?? DEFAULT_RUNNER_PAGE_CAP;
  if (!Number.isInteger(pageCap) || pageCap < 1 || pageCap > MAX_RUNNER_PAGE_CAP) {
    throw new Error(
      `RunnerGovernanceFoundation: runnerPageCap must be an integer from 1 to ${MAX_RUNNER_PAGE_CAP}`,
    );
  }
  return pageCap;
}

function buildValidatorChecks(
  repoFullName: string,
  environments: readonly RunnerGovernanceEnvironmentConfig[],
  workflows: readonly RunnerGovernancePrivilegedWorkflow[],
): RunnerGovernanceValidatorCheck[] {
  const environmentChecks = environments.flatMap((env) => [
    {
      id: "WF_ENV_2_LIVE_ENVIRONMENT_EXISTS",
      provider: "github" as const,
      resource: `github:${repoFullName}/environments/${env.name}`,
      message: `Environment ${env.name} must exist in GitHub settings.`,
    },
    {
      id: "WF_ENV_3_LIVE_ENVIRONMENT_REQUIRES_REVIEWERS",
      provider: "github" as const,
      resource: `github:${repoFullName}/environments/${env.name}`,
      message: `Environment ${env.name} must retain required reviewer protection.`,
    },
  ]);
  const workflowChecks = workflows.map((workflow) => ({
    id: "WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL",
    provider: "github" as const,
    resource: `${workflow.workflowPath}#${workflow.jobName}`,
    message: "Self-hosted runner labels must be explicitly approved or absent.",
  }));
  return [...environmentChecks, ...workflowChecks];
}

function buildWorkflowGovernanceCliArgs(approvedLabels: readonly string[]): string[] {
  return [
    "--check-settings",
    ...approvedLabels.flatMap((label) => ["--allow-self-hosted-runner-label", label]),
  ];
}

export class RunnerGovernanceFoundation
  extends pulumi.ComponentResource
  implements RunnerGovernanceFoundationOutputs
{
  public readonly repoFullName: pulumi.Output<string>;
  public readonly requiredEnvironmentNames: pulumi.Output<string[]>;
  public readonly productionEnvironmentNames: pulumi.Output<string[]>;
  public readonly approvedSelfHostedRunnerLabels: pulumi.Output<string[]>;
  public readonly selfHostedRunnerPolicy: pulumi.Output<RunnerGovernanceSelfHostedRunnerPolicy>;
  public readonly privilegedWorkflows: pulumi.Output<RunnerGovernancePrivilegedWorkflow[]>;
  public readonly environmentContracts: pulumi.Output<RunnerGovernanceEnvironmentConfig[]>;
  public readonly validatorChecks: pulumi.Output<RunnerGovernanceValidatorCheck[]>;
  public readonly workflowGovernanceCliArgs: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: RunnerGovernanceFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(RUNNER_GOVERNANCE_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    const owner = requireNonEmpty(args.owner, "owner");
    const repository = requireNonEmpty(args.repository, "repository");
    const repoFullName = `${owner}/${repository}`;
    const environments = args.environments.map(validateEnvironment);
    if (environments.length === 0) {
      throw new Error("RunnerGovernanceFoundation: at least one environment is required");
    }
    const environmentNames = new Set(environments.map((env) => env.name));
    if (environmentNames.size !== environments.length) {
      throw new Error("RunnerGovernanceFoundation: environment names must be unique");
    }
    const approvedLabels = normalizeLabels(args.approvedSelfHostedRunnerLabels);
    const approvedLabelSet = new Set(approvedLabels);
    const workflows = (args.privilegedWorkflows ?? []).map((workflow) =>
      validateWorkflow(workflow, environmentNames, approvedLabelSet),
    );
    const pageCap = validatePageCap(args.runnerPageCap);
    const policy: RunnerGovernanceSelfHostedRunnerPolicy = {
      mode: approvedLabels.length === 0 ? "deny" : "allow-list",
      approvedLabels,
      runnerPageCap: pageCap,
    };
    const productionEnvironmentNames = environments
      .filter((env) => env.name === "prod")
      .map((env) => env.name);
    const validatorChecks = buildValidatorChecks(repoFullName, environments, workflows);
    const workflowGovernanceCliArgs = buildWorkflowGovernanceCliArgs(approvedLabels);

    this.repoFullName = pulumi.output(repoFullName);
    this.requiredEnvironmentNames = pulumi.output([...environmentNames].sort());
    this.productionEnvironmentNames = pulumi.output(productionEnvironmentNames);
    this.approvedSelfHostedRunnerLabels = pulumi.output(approvedLabels);
    this.selfHostedRunnerPolicy = pulumi.output(policy);
    this.privilegedWorkflows = pulumi.output(workflows);
    this.environmentContracts = pulumi.output(environments);
    this.validatorChecks = pulumi.output(validatorChecks);
    this.workflowGovernanceCliArgs = pulumi.output(workflowGovernanceCliArgs);

    this.registerOutputs({
      repoFullName: this.repoFullName,
      requiredEnvironmentNames: this.requiredEnvironmentNames,
      productionEnvironmentNames: this.productionEnvironmentNames,
      approvedSelfHostedRunnerLabels: this.approvedSelfHostedRunnerLabels,
      selfHostedRunnerPolicy: this.selfHostedRunnerPolicy,
      privilegedWorkflows: this.privilegedWorkflows,
      environmentContracts: this.environmentContracts,
      validatorChecks: this.validatorChecks,
      workflowGovernanceCliArgs: this.workflowGovernanceCliArgs,
    });
  }
}
