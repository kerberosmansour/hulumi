import type {
  PolicyResource,
  ResourceValidationPolicy,
  StackValidationPolicy,
} from "@pulumi/policy";

import type { PackMetadata } from "../metadata";
import { isUrnChildOfComponent } from "../urn";

export const DEPLOY_GOV_1_RULE_ID = "DEPLOY_GOV_1_REQUIRE_PROTECTED_ENVIRONMENT";
export const DEPLOY_GOV_2_RULE_ID = "DEPLOY_GOV_2_NO_LONG_LIVED_AWS_SECRETS";

const GITHUB_REPOSITORY_TYPE = "github:index/repository:Repository";
const GITHUB_ENVIRONMENT_TYPE = "github:index/repositoryEnvironment:RepositoryEnvironment";
const GITHUB_SECRET_TYPES = [
  "github:index/actionsSecret:ActionsSecret",
  "github:index/actionsEnvironmentSecret:ActionsEnvironmentSecret",
  "github:index/actionsOrganizationSecret:ActionsOrganizationSecret",
] as const;
const DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE = "hulumi:platform:DeploymentRepositoryFoundation";
const GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE = "hulumi:platform:GitHubAwsOidcDeploymentRole";
const DOCS_URL =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/deployment-governance-policy-pack.md";

function stringArrayIncludes(value: unknown, needle: string): boolean {
  return Array.isArray(value) && value.some((item) => item === needle);
}

function normalizedRepositoryName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function repositoryName(resource: PolicyResource): string {
  const props = resource.props as Record<string, unknown>;
  return typeof props.name === "string" ? props.name : resource.name;
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

function environmentBelongsToRepo(environment: PolicyResource, repoName: string): boolean {
  const props = environment.props as Record<string, unknown>;
  const normalizedRepoName = normalizedRepositoryName(repoName);
  return normalizedRepositoryName(props.repository) === normalizedRepoName;
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

function hasProtectedEnvironment(resources: readonly PolicyResource[], repoName: string): boolean {
  return resources.some(
    (resource) =>
      resource.type === GITHUB_ENVIRONMENT_TYPE &&
      environmentBelongsToRepo(resource, repoName) &&
      environmentIsProtected(resource),
  );
}

function hasOidcRoleEvidence(resources: readonly PolicyResource[], repoName: string): boolean {
  const normalizedRepoName = normalizedRepositoryName(repoName);
  if (normalizedRepoName === undefined) return false;
  return resources.some((resource) => {
    if (resource.type !== GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE) return false;
    const props = resource.props as Record<string, unknown>;
    return normalizedRepositoryName(props.repository) === normalizedRepoName;
  });
}

function isChildOf(resource: PolicyResource, componentType: string): boolean {
  // Anchored URN type-chain check — see ../urn.ts. The previous form
  // `resource.urn.includes(\`${componentType}$\`)` was bypassed when a raw
  // resource was declared with a logical name embedding the component type,
  // because Pulumi URNs include the operator-controlled logical name after
  // the final `::`.
  return isUrnChildOfComponent(resource.urn, componentType);
}

function deploymentRepositoryFoundationName(resource: PolicyResource): string | undefined {
  const props = resource.props as Record<string, unknown>;
  return (
    normalizedRepositoryName(props.name) ??
    normalizedRepositoryName(props.repositoryName) ??
    normalizedRepositoryName(props.repository)
  );
}

function hasDeploymentRepositoryFoundationForRepo(
  resources: readonly PolicyResource[],
  repoName: string,
): boolean {
  const normalizedRepoName = normalizedRepositoryName(repoName);
  if (normalizedRepoName === undefined) return false;
  return resources.some(
    (resource) =>
      resource.type === DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE &&
      deploymentRepositoryFoundationName(resource) === normalizedRepoName,
  );
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

export const deployGov1RequireProtectedEnvironment: StackValidationPolicy = {
  name: DEPLOY_GOV_1_RULE_ID,
  description: "Requires deployment-capable repositories to use protected environments.",
  enforcementLevel: "mandatory",
  validateStack: (args, reportViolation) => {
    for (const repo of args.resources.filter(isDeploymentCapableRepository)) {
      const repoName = repositoryName(repo);
      if (isChildOf(repo, DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE)) continue;
      if (hasDeploymentRepositoryFoundationForRepo(args.resources, repoName)) continue;
      const protectedEnv = hasProtectedEnvironment(args.resources, repoName);
      const oidcRole = hasOidcRoleEvidence(args.resources, repoName);
      if (protectedEnv && oidcRole) continue;
      reportViolation(
        `${DEPLOY_GOV_1_RULE_ID}: deployment-capable repository ${repo.urn} needs at least one protected GitHub environment and GitHubAwsOidcDeploymentRole evidence. Docs: ${DOCS_URL}`,
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
  ],
};
