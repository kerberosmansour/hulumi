// BDD scenarios for M4 deployment-governance policy.

import { describe, it, expect, beforeEach } from "vitest";
import type { PolicyResource, ResourceValidationArgs, StackValidationArgs } from "@pulumi/policy";

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
