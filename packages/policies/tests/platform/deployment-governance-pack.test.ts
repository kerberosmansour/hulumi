// BDD scenarios for M4 deployment-governance policy.

import { describe, it, expect, beforeEach } from "vitest";
import type {
  PolicyResource,
  ResourceValidationArgs,
  ResourceValidationPolicy,
  StackValidationArgs,
} from "@pulumi/policy";

import {
  DEPLOY_GOV_1_RULE_ID,
  DEPLOY_GOV_2_RULE_ID,
  deployGov1RequireProtectedEnvironment,
  deployGov2NoLongLivedAwsSecrets,
} from "../../src/platform";

function makePolicyResource(partial: Partial<PolicyResource>): PolicyResource {
  return {
    type: "",
    props: {},
    urn: "",
    name: "",
    dependencies: [],
    propertyDependencies: {},
    ...partial,
  } as PolicyResource;
}

function makeResourceArgs(partial: Partial<ResourceValidationArgs>): ResourceValidationArgs {
  return {
    type: "",
    props: {},
    urn: "",
    name: "",
    opts: {} as ResourceValidationArgs["opts"],
    isType: (() => false) as ResourceValidationArgs["isType"],
    asType: ((): undefined => undefined) as ResourceValidationArgs["asType"],
    getConfig: (() => ({})) as ResourceValidationArgs["getConfig"],
    ...partial,
  } as ResourceValidationArgs;
}

function makeStackArgs(resources: PolicyResource[]): StackValidationArgs {
  return {
    resources,
    getConfig: (() => ({})) as StackValidationArgs["getConfig"],
  } as StackValidationArgs;
}

const GITHUB_REPOSITORY_TYPE = "github:index/repository:Repository";
const GITHUB_ENVIRONMENT_TYPE = "github:index/repositoryEnvironment:RepositoryEnvironment";
const GITHUB_SECRET_TYPE = "github:index/actionsSecret:ActionsSecret";
const DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE = "hulumi:platform:DeploymentRepositoryFoundation";
const GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE = "hulumi:platform:GitHubAwsOidcDeploymentRole";

describe("HulumiDeploymentGovernancePack DEPLOY_GOV_1 — protected env required", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("reports DEPLOY_GOV_1 when a deployment-capable repo has no protected environment", () => {
    const repo = makePolicyResource({
      type: GITHUB_REPOSITORY_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_REPOSITORY_TYPE}::deploy-repo`,
      name: "deploy-repo",
      props: {
        name: "deploy-repo",
        visibility: "private",
        topics: ["deployment"],
      },
    });

    (
      deployGov1RequireProtectedEnvironment.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([repo]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(DEPLOY_GOV_1_RULE_ID);
    expect(violations[0]).toContain(repo.urn);
  });

  it("does NOT report when the repo has a protected environment and OIDC role evidence", () => {
    const repo = makePolicyResource({
      type: GITHUB_REPOSITORY_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_REPOSITORY_TYPE}::deploy-repo`,
      name: "deploy-repo",
      props: { name: "deploy-repo", topics: ["deployment"] },
    });
    const env = makePolicyResource({
      type: GITHUB_ENVIRONMENT_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_ENVIRONMENT_TYPE}::deploy-repo-prod`,
      name: "deploy-repo-prod",
      props: {
        repository: "deploy-repo",
        environment: "prod",
        reviewers: [{ teams: [1234] }],
        deploymentBranchPolicy: { protectedBranches: true, customBranchPolicies: false },
      },
    });
    const oidcRole = makePolicyResource({
      type: GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE}::deploy-role`,
      name: "deploy-role",
      props: { repository: "deploy-repo", environment: "prod" },
    });

    (
      deployGov1RequireProtectedEnvironment.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([repo, env, oidcRole]), report);

    expect(violations).toEqual([]);
  });

  it("does NOT report for DeploymentRepositoryFoundation positive fixtures", () => {
    const foundation = makePolicyResource({
      type: DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE,
      urn: `urn:pulumi:s::p::${DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE}::deploy-repo`,
      name: "deploy-repo",
      props: { repositoryName: "deploy-repo" },
    });

    (
      deployGov1RequireProtectedEnvironment.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([foundation]), report);

    expect(violations).toEqual([]);
  });

  it("does NOT report when a deployment-capable repo has matching DeploymentRepositoryFoundation evidence", () => {
    const repo = makePolicyResource({
      type: GITHUB_REPOSITORY_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_REPOSITORY_TYPE}::deploy-repo`,
      name: "deploy-repo",
      props: { name: "deploy-repo", topics: ["deployment"] },
    });
    const foundation = makePolicyResource({
      type: DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE,
      urn: `urn:pulumi:s::p::${DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE}::deploy-repo-foundation`,
      name: "deploy-repo-foundation",
      props: { name: "deploy-repo" },
    });

    (
      deployGov1RequireProtectedEnvironment.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([repo, foundation]), report);

    expect(violations).toEqual([]);
  });

  it("reports when only unrelated DeploymentRepositoryFoundation evidence exists", () => {
    const repo = makePolicyResource({
      type: GITHUB_REPOSITORY_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_REPOSITORY_TYPE}::victim-repo`,
      name: "victim-repo",
      props: { name: "victim-repo", topics: ["deployment"] },
    });
    const unrelatedFoundation = makePolicyResource({
      type: DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE,
      urn: `urn:pulumi:s::p::${DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE}::victim-repo`,
      name: "victim-repo",
      props: { name: "safe-repo" },
    });

    (
      deployGov1RequireProtectedEnvironment.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([repo, unrelatedFoundation]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(repo.urn);
  });

  it("does not treat unscoped OIDC role evidence as matching a deployment repository", () => {
    const repo = makePolicyResource({
      type: GITHUB_REPOSITORY_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_REPOSITORY_TYPE}::deploy-repo`,
      name: "deploy-repo",
      props: { name: "deploy-repo", topics: ["deployment"] },
    });
    const env = makePolicyResource({
      type: GITHUB_ENVIRONMENT_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_ENVIRONMENT_TYPE}::deploy-repo-prod`,
      name: "deploy-repo-prod",
      props: {
        repository: "deploy-repo",
        environment: "prod",
        reviewers: [{ teams: [1234] }],
        deploymentBranchPolicy: { protectedBranches: true, customBranchPolicies: false },
      },
    });
    const unscopedOidcRole = makePolicyResource({
      type: GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE}::generic-role`,
      name: "generic-role",
      props: { environment: "prod" },
    });

    (
      deployGov1RequireProtectedEnvironment.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([repo, env, unscopedOidcRole]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(repo.urn);
  });

  it("does not treat a protected environment for another repository as matching by logical name", () => {
    const repo = makePolicyResource({
      type: GITHUB_REPOSITORY_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_REPOSITORY_TYPE}::victim-repo`,
      name: "victim-repo",
      props: { name: "victim-repo", topics: ["deployment"] },
    });
    const env = makePolicyResource({
      type: GITHUB_ENVIRONMENT_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_ENVIRONMENT_TYPE}::victim-repo-prod`,
      name: "victim-repo-prod",
      props: {
        repository: "safe-repo",
        environment: "prod",
        reviewers: [{ teams: [1234] }],
        deploymentBranchPolicy: { protectedBranches: true, customBranchPolicies: false },
      },
    });
    const oidcRole = makePolicyResource({
      type: GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE}::victim-role`,
      name: "victim-role",
      props: { repository: "victim-repo", environment: "prod" },
    });

    (
      deployGov1RequireProtectedEnvironment.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([repo, env, oidcRole]), report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(repo.urn);
  });
});

describe("HulumiDeploymentGovernancePack M7 runner governance backstops", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("reports DEPLOY_GOV_3 when RunnerGovernanceFoundation allows unapproved self-hosted labels", async () => {
    const platform = (await import("../../src/platform")) as Record<string, unknown>;
    expect(platform.DEPLOY_GOV_3_RULE_ID).toBe("DEPLOY_GOV_3_NO_UNAPPROVED_SELF_HOSTED_RUNNERS");
    const policy = platform.deployGov3NoUnapprovedSelfHostedRunners as ResourceValidationPolicy;
    const resource = makeResourceArgs({
      type: "hulumi:platform:RunnerGovernanceFoundation",
      urn: "urn:pulumi:s::p::hulumi:platform:RunnerGovernanceFoundation::runner-gov",
      name: "runner-gov",
      props: {
        approvedSelfHostedRunnerLabels: ["deploy-prod"],
        privilegedWorkflows: [
          {
            workflowPath: ".github/workflows/deploy.yml",
            jobName: "deploy",
            runsOn: ["self-hosted", "linux", "x64", "deploy-prod"],
          },
        ],
      },
    });

    (policy.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      resource,
      report,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("DEPLOY_GOV_3_NO_UNAPPROVED_SELF_HOSTED_RUNNERS");
  });

  it("reports DEPLOY_GOV_4 when privileged workflow metadata disables OIDC or names cloud secrets", async () => {
    const platform = (await import("../../src/platform")) as Record<string, unknown>;
    expect(platform.DEPLOY_GOV_4_RULE_ID).toBe("DEPLOY_GOV_4_PRIVILEGED_WORKFLOWS_REQUIRE_OIDC");
    const policy = platform.deployGov4PrivilegedWorkflowsRequireOidc as ResourceValidationPolicy;
    const resource = makeResourceArgs({
      type: "hulumi:platform:RunnerGovernanceFoundation",
      urn: "urn:pulumi:s::p::hulumi:platform:RunnerGovernanceFoundation::runner-gov",
      name: "runner-gov",
      props: {
        privilegedWorkflows: [
          {
            workflowPath: ".github/workflows/deploy.yml",
            jobName: "deploy",
            oidcRequired: false,
            longLivedCloudSecretNames: ["AWS_SECRET_ACCESS_KEY"],
          },
        ],
      },
    });

    (policy.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      resource,
      report,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("DEPLOY_GOV_4_PRIVILEGED_WORKFLOWS_REQUIRE_OIDC");
    expect(violations[0]).not.toContain("secret value");
  });
});

describe("HulumiDeploymentGovernancePack DEPLOY_GOV_2 — long-lived AWS secret rejected", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("reports DEPLOY_GOV_2 without printing the secret value", () => {
    const secretValue = "AKIAIOSFODNN7EXAMPLE";
    const args = makeResourceArgs({
      type: GITHUB_SECRET_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_SECRET_TYPE}::aws-key`,
      name: "aws-key",
      props: {
        repository: "deploy-repo",
        secretName: "AWS_ACCESS_KEY_ID",
        plaintextValue: secretValue,
      },
    });

    (
      deployGov2NoLongLivedAwsSecrets.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(DEPLOY_GOV_2_RULE_ID);
    expect(violations[0]).not.toContain(secretValue);
  });

  it("allows role-ARN references used by OIDC deployment flows", () => {
    const args = makeResourceArgs({
      type: GITHUB_SECRET_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_SECRET_TYPE}::role-arn`,
      name: "role-arn",
      props: {
        repository: "deploy-repo",
        secretName: "PROD_DEPLOY_ROLE_ARN",
        plaintextValue: "arn:aws:iam::123456789012:role/deploy",
      },
    });

    (
      deployGov2NoLongLivedAwsSecrets.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toEqual([]);
  });
});

// Cluster B regression — URN substring spoof (`isChildOf` used `urn.includes`
// over the FULL URN, so a raw resource whose operator-controlled logical
// name contained the parent type token bypassed every DEPLOY_GOV_1 check).
describe("HulumiDeploymentGovernancePack DEPLOY_GOV_1 — forged-logical-name URN spoof", () => {
  let violations: string[];
  const report = (m: string): void => {
    violations.push(m);
  };

  beforeEach(() => {
    violations = [];
  });

  it("reports DEPLOY_GOV_1 even when the repo's LOGICAL NAME embeds the foundation type", () => {
    // Exploit: declare a raw github.Repository with logical name
    // `<DeploymentRepositoryFoundation type>$<anything>`. The URL now contains
    // the substring `hulumi:platform:DeploymentRepositoryFoundation$` but the
    // resource is NOT a child of any DeploymentRepositoryFoundation — its
    // type chain is just `github:index/repository:Repository`. A safe
    // anchored check parses the URN type chain and refuses this spoof.
    const spoofedRepo = makePolicyResource({
      type: GITHUB_REPOSITORY_TYPE,
      // Logical name carries the parent type substring; type chain does not.
      urn: `urn:pulumi:s::p::${GITHUB_REPOSITORY_TYPE}::${DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE}$deploy-repo`,
      name: `${DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE}$deploy-repo`,
      props: { name: "victim-repo", topics: ["deployment"] },
    });

    (
      deployGov1RequireProtectedEnvironment.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([spoofedRepo]), report);

    // Without the anchored fix, this assertion is `.toEqual([])` — the spoof bypasses.
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(DEPLOY_GOV_1_RULE_ID);
  });
});
