import type {
  PolicyResource,
  ResourceValidationPolicy,
  StackValidationPolicy,
} from "@pulumi/policy";

import type { PackMetadata } from "../metadata";
import { isUrnChildOfComponent, parseUrn } from "../urn";

export const DEPLOY_GOV_1_RULE_ID = "DEPLOY_GOV_1_REQUIRE_PROTECTED_ENVIRONMENT";
export const DEPLOY_GOV_2_RULE_ID = "DEPLOY_GOV_2_NO_LONG_LIVED_AWS_SECRETS";
export const DEPLOY_GOV_3_RULE_ID = "DEPLOY_GOV_3_NO_UNAPPROVED_SELF_HOSTED_RUNNERS";
export const DEPLOY_GOV_4_RULE_ID = "DEPLOY_GOV_4_PRIVILEGED_WORKFLOWS_REQUIRE_OIDC";

const GITHUB_REPOSITORY_TYPE = "github:index/repository:Repository";
const GITHUB_ENVIRONMENT_TYPE = "github:index/repositoryEnvironment:RepositoryEnvironment";
const GITHUB_SECRET_TYPES = [
  "github:index/actionsSecret:ActionsSecret",
  "github:index/actionsEnvironmentSecret:ActionsEnvironmentSecret",
  "github:index/actionsOrganizationSecret:ActionsOrganizationSecret",
] as const;
const GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE = "hulumi:platform:GitHubAwsOidcDeploymentRole";
const AWS_IAM_ROLE_TYPE = "aws:iam/role:Role";
const RUNNER_GOVERNANCE_FOUNDATION_TYPE = "hulumi:platform:RunnerGovernanceFoundation";
const DOCS_URL =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/deployment-governance-policy-pack.md";

function stringArrayIncludes(value: unknown, needle: string): boolean {
  return Array.isArray(value) && value.some((item) => item === needle);
}

function exactString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.length > 0 && value === value.trim() ? value : undefined;
}

function repositoryName(resource: PolicyResource): string | undefined {
  const props = resource.props as Record<string, unknown>;
  return exactString(props.name);
}

function isDeploymentCapableRepository(resource: PolicyResource): boolean {
  if (resource.type !== GITHUB_REPOSITORY_TYPE) return false;
  const props = resource.props as Record<string, unknown>;
  if (props.deploymentCapable === true) return true;
  if (stringArrayIncludes(props.topics, "deployment")) return true;
  if (stringArrayIncludes(props.topics, "deployments")) return true;
  return (
    typeof props.description === "string" &&
    props.description.includes("hulumi:deployment-capable=true")
  );
}

function environmentBelongsToRepo(environment: PolicyResource, repo: PolicyResource): boolean {
  const props = environment.props as Record<string, unknown>;
  const repoName = repositoryName(repo);
  if (repoName === undefined || exactString(props.repository) !== repoName) return false;
  return (environment.propertyDependencies?.repository ?? []).some(
    (dependency) => dependency.type === repo.type && dependency.urn === repo.urn,
  );
}

function environmentIsProtected(environment: PolicyResource): boolean {
  const props = environment.props as Record<string, unknown>;
  if (Array.isArray(props.reviewers) && props.reviewers.length > 0) return true;
  const policy = props.deploymentBranchPolicy;
  if (policy !== null && typeof policy === "object") {
    const record = policy as Record<string, unknown>;
    return record.protectedBranches === true || record.customBranchPolicies === true;
  }
  return false;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function githubName(value: unknown): string | undefined {
  const string = exactString(value);
  return string !== undefined && /^[A-Za-z0-9_.-]+$/.test(string) ? string : undefined;
}

function environmentSubject(props: Record<string, unknown>): string | undefined {
  const mode = object(props.subjectMode);
  if (mode !== undefined) {
    if (mode.kind !== "environment") return undefined;
    const environment = exactString(mode.environment);
    const legacy = props.environment === undefined ? undefined : exactString(props.environment);
    if (environment === undefined || (legacy !== undefined && legacy !== environment)) {
      return undefined;
    }
    return environment;
  }
  return exactString(props.environment);
}

function exactWorkflowRef(value: unknown, fullRepository: string): string | undefined {
  const workflowRef = exactString(value);
  if (workflowRef === undefined || workflowRef.includes("*")) return undefined;
  const prefix = `${fullRepository}/.github/workflows/`;
  if (!workflowRef.startsWith(prefix)) return undefined;
  const separator = workflowRef.indexOf("@refs/", prefix.length);
  if (separator <= prefix.length || workflowRef.indexOf("@refs/", separator + 1) !== -1) {
    return undefined;
  }
  const workflowPath = workflowRef.slice(prefix.length, separator);
  const ref = workflowRef.slice(separator + 1);
  if (
    workflowPath.length === 0 ||
    workflowPath.includes("..") ||
    workflowPath.includes("//") ||
    ref.length <= "refs/".length
  ) {
    return undefined;
  }
  return workflowRef;
}

function exactGitHubProviderArn(value: unknown): string | undefined {
  const providerArn = exactString(value);
  return providerArn !== undefined &&
    /^arn:(?:aws|aws-us-gov|aws-cn):iam::[0-9]{12}:oidc-provider\/token\.actions\.githubusercontent\.com$/.test(
      providerArn,
    )
    ? providerArn
    : undefined;
}

interface DeploymentAuthorityTuple {
  readonly component: PolicyResource;
  readonly owner: string;
  readonly repository: string;
  readonly environment: string;
  readonly fullRepository: string;
  readonly workflowRef: string;
  readonly providerArn: string;
}

function deploymentAuthorityTuple(
  component: PolicyResource,
  repoName: string,
  environmentName: string,
): DeploymentAuthorityTuple | undefined {
  if (component.type !== GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE) return undefined;
  const props = component.props as Record<string, unknown>;
  const owner = githubName(props.owner);
  const repository = githubName(props.repository);
  const environment = environmentSubject(props);
  if (
    owner === undefined ||
    repository !== repoName ||
    environment !== environmentName ||
    props.audience !== "sts.amazonaws.com"
  ) {
    return undefined;
  }
  const fullRepository = `${owner}/${repository}`;
  const workflowRef = exactWorkflowRef(props.reusableWorkflowRef, fullRepository);
  const providerArn = exactGitHubProviderArn(props.oidcProviderArn);
  if (workflowRef === undefined || providerArn === undefined) return undefined;
  return {
    component,
    owner,
    repository,
    environment,
    fullRepository,
    workflowRef,
    providerArn,
  };
}

function roleIsChildOfComponent(role: PolicyResource, component: PolicyResource): boolean {
  if (role.type !== AWS_IAM_ROLE_TYPE) return false;
  if (!isUrnChildOfComponent(role.urn, GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE)) return false;
  if (role.name !== `${component.name}-role`) return false;
  const roleUrn = parseUrn(role.urn);
  const componentUrn = parseUrn(component.urn);
  return (
    roleUrn !== undefined &&
    componentUrn !== undefined &&
    roleUrn.stack === componentUrn.stack &&
    roleUrn.project === componentUrn.project
  );
}

function roleTrustMatches(role: PolicyResource, tuple: DeploymentAuthorityTuple): boolean {
  if (!roleIsChildOfComponent(role, tuple.component)) return false;
  const props = role.props as Record<string, unknown>;
  const tags = object(props.tags);
  if (
    tags === undefined ||
    tags["hulumi:component"] !== "GitHubAwsOidcDeploymentRole" ||
    tags["hulumi:github-repository"] !== tuple.fullRepository ||
    tags["hulumi:github-environment"] !== tuple.environment
  ) {
    return false;
  }
  const policyJson = exactString(props.assumeRolePolicy);
  if (policyJson === undefined) return false;
  let policy: Record<string, unknown>;
  try {
    const parsed = JSON.parse(policyJson) as unknown;
    const parsedObject = object(parsed);
    if (parsedObject === undefined) return false;
    policy = parsedObject;
  } catch {
    return false;
  }
  if (!Array.isArray(policy.Statement) || policy.Statement.length !== 1) return false;
  const statement = object(policy.Statement[0]);
  if (
    statement === undefined ||
    !exactKeys(statement, ["Effect", "Principal", "Action", "Condition"]) ||
    statement.Effect !== "Allow" ||
    statement.Action !== "sts:AssumeRoleWithWebIdentity"
  ) {
    return false;
  }
  const principal = object(statement.Principal);
  const condition = object(statement.Condition);
  if (
    principal === undefined ||
    !exactKeys(principal, ["Federated"]) ||
    principal.Federated !== tuple.providerArn ||
    condition === undefined ||
    !exactKeys(condition, ["StringEquals"])
  ) {
    return false;
  }
  const equals = object(condition.StringEquals);
  return (
    equals !== undefined &&
    exactKeys(equals, [
      "token.actions.githubusercontent.com:aud",
      "token.actions.githubusercontent.com:sub",
      "token.actions.githubusercontent.com:job_workflow_ref",
    ]) &&
    equals["token.actions.githubusercontent.com:aud"] === "sts.amazonaws.com" &&
    equals["token.actions.githubusercontent.com:sub"] ===
      `repo:${tuple.fullRepository}:environment:${tuple.environment}` &&
    equals["token.actions.githubusercontent.com:job_workflow_ref"] === tuple.workflowRef
  );
}

function hasExactDeploymentAuthorityTuple(
  resources: readonly PolicyResource[],
  repo: PolicyResource,
): boolean {
  const repoName = repositoryName(repo);
  if (repoName === undefined) return false;
  const environments = resources.filter(
    (resource) =>
      resource.type === GITHUB_ENVIRONMENT_TYPE &&
      environmentBelongsToRepo(resource, repo) &&
      environmentIsProtected(resource),
  );
  for (const environment of environments) {
    const environmentName = exactString((environment.props as Record<string, unknown>).environment);
    if (environmentName === undefined) continue;
    for (const component of resources) {
      const tuple = deploymentAuthorityTuple(component, repoName, environmentName);
      if (tuple === undefined) continue;
      if (resources.some((resource) => roleTrustMatches(resource, tuple))) return true;
    }
  }
  return false;
}

function isGitHubSecretType(type: string): boolean {
  return (GITHUB_SECRET_TYPES as readonly string[]).includes(type);
}

function isLongLivedAwsSecretName(secretName: string): boolean {
  return [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_ACCESS_KEY",
  ].includes(secretName.toUpperCase());
}

function normalizeRunnerLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

function workflowArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is Record<string, unknown> => item !== null && typeof item === "object",
  );
}

function runnerLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeRunnerLabel).filter((label): label is string => label !== undefined);
}

function longLivedCloudSecretNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .filter(isLongLivedAwsSecretName);
}

export const deployGov1RequireProtectedEnvironment: StackValidationPolicy = {
  name: DEPLOY_GOV_1_RULE_ID,
  description: "Requires deployment-capable repositories to use protected environments.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    for (const repo of args.resources.filter(isDeploymentCapableRepository)) {
      if (hasExactDeploymentAuthorityTuple(args.resources, repo)) continue;
      reportViolation(
        `${DEPLOY_GOV_1_RULE_ID}: deployment-capable repository ${repo.urn} needs one exact repository-bound protected environment and matching GitHub OIDC component plus child IAM trust tuple. Docs: ${DOCS_URL}`,
      );
    }
  },
};

export const deployGov2NoLongLivedAwsSecrets: ResourceValidationPolicy = {
  name: DEPLOY_GOV_2_RULE_ID,
  description: "Rejects long-lived AWS deployment credentials in GitHub secret resources.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (!isGitHubSecretType(args.type)) return;
    const props = args.props as Record<string, unknown>;
    const secretName = typeof props.secretName === "string" ? props.secretName : args.name;
    if (!isLongLivedAwsSecretName(secretName)) return;
    reportViolation(
      `${DEPLOY_GOV_2_RULE_ID}: GitHub secret resource ${args.urn} uses long-lived AWS credential name ${secretName}. Use GitHubAwsOidcDeploymentRole and role ARN references instead. Secret values are intentionally omitted. Docs: ${DOCS_URL}`,
    );
  },
};

export const deployGov3NoUnapprovedSelfHostedRunners: ResourceValidationPolicy = {
  name: DEPLOY_GOV_3_RULE_ID,
  description: "Rejects unapproved self-hosted runner labels in runner-governance contracts.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== RUNNER_GOVERNANCE_FOUNDATION_TYPE) return;
    const props = args.props as Record<string, unknown>;
    const approved = new Set(runnerLabels(props.approvedSelfHostedRunnerLabels));
    for (const workflow of workflowArray(props.privilegedWorkflows)) {
      const labels = runnerLabels(workflow.runsOn);
      if (!labels.includes("self-hosted")) continue;
      const nonSelfHostedLabels = labels.filter((label) => label !== "self-hosted");
      const unapproved = nonSelfHostedLabels.filter((label) => !approved.has(label));
      if (approved.size > 0 && nonSelfHostedLabels.length > 0 && unapproved.length === 0) continue;
      reportViolation(
        `${DEPLOY_GOV_3_RULE_ID}: RunnerGovernanceFoundation ${args.urn} declares self-hosted runner usage without a finite approval for every label. Docs: ${DOCS_URL}`,
      );
    }
  },
};

export const deployGov4PrivilegedWorkflowsRequireOidc: ResourceValidationPolicy = {
  name: DEPLOY_GOV_4_RULE_ID,
  description: "Requires privileged deployment workflow metadata to use OIDC, not cloud secrets.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== RUNNER_GOVERNANCE_FOUNDATION_TYPE) return;
    const props = args.props as Record<string, unknown>;
    for (const workflow of workflowArray(props.privilegedWorkflows)) {
      const oidcDisabled = workflow.oidcRequired === false;
      const cloudSecrets = longLivedCloudSecretNames(workflow.longLivedCloudSecretNames);
      if (!oidcDisabled && cloudSecrets.length === 0) continue;
      reportViolation(
        `${DEPLOY_GOV_4_RULE_ID}: RunnerGovernanceFoundation ${args.urn} has privileged workflow metadata that disables OIDC or names long-lived cloud credential secrets (${cloudSecrets.join(", ") || "none named"}). Secret values are intentionally omitted. Docs: ${DOCS_URL}`,
      );
    }
  },
};

export const hulumiDeploymentGovernancePackMetadata: PackMetadata = {
  id: "hulumi-deployment-governance-pack",
  title: "Hulumi Deployment Governance Pack",
  framework: "github",
  frameworkVersion: "0.1.0",
  severity: "high",
  rules: [
    {
      id: DEPLOY_GOV_1_RULE_ID,
      title: "Deployment repositories require protected environments",
      description: deployGov1RequireProtectedEnvironment.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["NIST-800-218A:PO.5", "NIST-SSDF-v1.1:PW.6"],
      docsUrl: DOCS_URL,
    },
    {
      id: DEPLOY_GOV_2_RULE_ID,
      title: "No long-lived AWS deployment secrets",
      description: deployGov2NoLongLivedAwsSecrets.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["NIST-800-218A:PS.2", "NIST-SSDF-v1.1:PS.2"],
      docsUrl: DOCS_URL,
    },
    {
      id: DEPLOY_GOV_3_RULE_ID,
      title: "Self-hosted runners require explicit approval",
      description: deployGov3NoUnapprovedSelfHostedRunners.description!,
      severity: "critical",
      enforcement: "mandatory",
      frameworkIds: ["NIST-800-218A:PO.5", "NIST-SSDF-v1.1:PW.6"],
      docsUrl: DOCS_URL,
    },
    {
      id: DEPLOY_GOV_4_RULE_ID,
      title: "Privileged workflows require OIDC",
      description: deployGov4PrivilegedWorkflowsRequireOidc.description!,
      severity: "high",
      enforcement: "mandatory",
      frameworkIds: ["NIST-800-218A:PS.2", "NIST-SSDF-v1.1:PS.2"],
      docsUrl: DOCS_URL,
    },
  ],
};
