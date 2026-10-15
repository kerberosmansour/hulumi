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
const AWS_IAM_ROLE_TYPE = "aws:iam/role:Role";

const OWNER = "example-org";
const REPOSITORY = "deploy-repo";
const ENVIRONMENT = "prod";
const AUDIENCE = "sts.amazonaws.com";
const OIDC_PROVIDER_ARN =
  "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com";
const WORKFLOW_REF = `${OWNER}/${REPOSITORY}/.github/workflows/deploy.yml@refs/heads/main`;

interface DeploymentTupleOverrides {
  readonly environmentRepository?: string;
  readonly environmentDependency?: PolicyResource | false;
  readonly componentProps?: Record<string, unknown>;
  readonly omitIamRole?: boolean;
  readonly iamRoleName?: string;
  readonly iamRoleUrn?: string;
  readonly iamTrust?: unknown;
  readonly iamTags?: Record<string, unknown>;
}

function trustPolicy(
  overrides: {
    owner?: string;
    repository?: string;
    environment?: string;
    audience?: string;
    providerArn?: string;
    workflowRef?: string;
    action?: string;
    extraStatement?: boolean;
  } = {},
): string {
  const owner = overrides.owner ?? OWNER;
  const repository = overrides.repository ?? REPOSITORY;
  const environment = overrides.environment ?? ENVIRONMENT;
  const statement = {
    Effect: "Allow",
    Principal: { Federated: overrides.providerArn ?? OIDC_PROVIDER_ARN },
    Action: overrides.action ?? "sts:AssumeRoleWithWebIdentity",
    Condition: {
      StringEquals: {
        "token.actions.githubusercontent.com:aud": overrides.audience ?? AUDIENCE,
        "token.actions.githubusercontent.com:sub": `repo:${owner}/${repository}:environment:${environment}`,
        "token.actions.githubusercontent.com:job_workflow_ref":
          overrides.workflowRef ?? WORKFLOW_REF,
      },
    },
  };
  return JSON.stringify({
    Version: "2012-10-17",
    Statement: overrides.extraStatement
      ? [
          statement,
          {
            Effect: "Allow",
            Principal: { Federated: OIDC_PROVIDER_ARN },
            Action: "sts:AssumeRoleWithWebIdentity",
          },
        ]
      : [statement],
  });
}

function deploymentTuple(overrides: DeploymentTupleOverrides = {}): PolicyResource[] {
  const repo = makePolicyResource({
    type: GITHUB_REPOSITORY_TYPE,
    urn: `urn:pulumi:s::p::${GITHUB_REPOSITORY_TYPE}::${REPOSITORY}`,
    name: REPOSITORY,
    props: { name: REPOSITORY, topics: ["deployment"] },
  });
  const environmentDependency = overrides.environmentDependency ?? repo;
  const environment = makePolicyResource({
    type: GITHUB_ENVIRONMENT_TYPE,
    urn: `urn:pulumi:s::p::${GITHUB_ENVIRONMENT_TYPE}::${REPOSITORY}-${ENVIRONMENT}`,
    name: `${REPOSITORY}-${ENVIRONMENT}`,
    props: {
      repository: overrides.environmentRepository ?? REPOSITORY,
      environment: ENVIRONMENT,
      reviewers: [{ teams: [1234] }],
      deploymentBranchPolicy: { protectedBranches: true, customBranchPolicies: false },
    },
    propertyDependencies:
      environmentDependency === false ? {} : { repository: [environmentDependency] },
  });
  const oidcComponent = makePolicyResource({
    type: GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE,
    urn: `urn:pulumi:s::p::${GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE}::deploy-role`,
    name: "deploy-role",
    props: {
      owner: OWNER,
      repository: REPOSITORY,
      environment: ENVIRONMENT,
      reusableWorkflowRef: WORKFLOW_REF,
      audience: AUDIENCE,
      oidcProviderArn: OIDC_PROVIDER_ARN,
      ...overrides.componentProps,
    },
  });
  const iamRole = makePolicyResource({
    type: AWS_IAM_ROLE_TYPE,
    urn:
      overrides.iamRoleUrn ??
      `urn:pulumi:s::p::${GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE}$${AWS_IAM_ROLE_TYPE}::deploy-role-role`,
    name: overrides.iamRoleName ?? "deploy-role-role",
    props: {
      assumeRolePolicy: overrides.iamTrust ?? trustPolicy(),
      tags: overrides.iamTags ?? {
        "hulumi:component": "GitHubAwsOidcDeploymentRole",
        "hulumi:github-repository": `${OWNER}/${REPOSITORY}`,
        "hulumi:github-environment": ENVIRONMENT,
      },
    },
  });
  return overrides.omitIamRole
    ? [repo, environment, oidcComponent]
    : [repo, environment, oidcComponent, iamRole];
}

function runDeployGov1(resources: PolicyResource[]): string[] {
  const violations: string[] = [];
  (
    deployGov1RequireProtectedEnvironment.validateStack as (
      a: StackValidationArgs,
      r: (m: string) => void,
    ) => void
  )(makeStackArgs(resources), (message) => violations.push(message));
  return violations;
}

describe("HulumiDeploymentGovernancePack DEPLOY_GOV_1 — protected env required", () => {
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

    const violations = runDeployGov1([repo]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(DEPLOY_GOV_1_RULE_ID);
    expect(violations[0]).toContain(repo.urn);
  });

  it("does NOT report when one exact repository/environment/workflow/IAM tuple exists", () => {
    expect(runDeployGov1(deploymentTuple())).toEqual([]);
  });

  it("rejects a matching environment value without an exact repository property dependency", () => {
    expect(runDeployGov1(deploymentTuple({ environmentDependency: false }))).toHaveLength(1);
  });

  it("rejects an environment property dependency on a different repository", () => {
    const decoy = makePolicyResource({
      type: GITHUB_REPOSITORY_TYPE,
      urn: `urn:pulumi:s::p::${GITHUB_REPOSITORY_TYPE}::decoy`,
      name: "decoy",
      props: { name: "decoy" },
    });
    const resources = deploymentTuple({ environmentDependency: decoy });
    expect(runDeployGov1([...resources, decoy])).toHaveLength(1);
  });

  it("rejects independently matching environment and component evidence", () => {
    expect(
      runDeployGov1(
        deploymentTuple({
          componentProps: { environment: "dev" },
          iamTrust: trustPolicy({ environment: "dev" }),
          iamTags: {
            "hulumi:component": "GitHubAwsOidcDeploymentRole",
            "hulumi:github-repository": `${OWNER}/${REPOSITORY}`,
            "hulumi:github-environment": "dev",
          },
        }),
      ),
    ).toHaveLength(1);
  });

  it.each([
    ["owner", { owner: "other-org" }],
    ["repository", { repository: "other-repo" }],
    ["audience", { audience: "example.invalid" }],
    [
      "workflow repository",
      {
        reusableWorkflowRef: `other-org/${REPOSITORY}/.github/workflows/deploy.yml@refs/heads/main`,
      },
    ],
    [
      "workflow wildcard",
      { reusableWorkflowRef: `${OWNER}/${REPOSITORY}/.github/workflows/deploy.yml@refs/heads/*` },
    ],
    ["provider", { oidcProviderArn: `${OIDC_PROVIDER_ARN}.evil` }],
    ["conflicting subject modes", { subjectMode: { kind: "environment", environment: "dev" } }],
  ])("rejects forged component %s evidence", (_label, componentProps) => {
    expect(runDeployGov1(deploymentTuple({ componentProps }))).toHaveLength(1);
  });

  it("rejects component evidence without a child IAM role", () => {
    expect(runDeployGov1(deploymentTuple({ omitIamRole: true }))).toHaveLength(1);
  });

  it.each([
    ["wrong deterministic name", { iamRoleName: "unrelated-role" }],
    [
      "no OIDC component ancestor",
      { iamRoleUrn: `urn:pulumi:s::p::${AWS_IAM_ROLE_TYPE}::deploy-role-role` },
    ],
    [
      "different stack",
      {
        iamRoleUrn:
          `urn:pulumi:other::p::${GITHUB_AWS_OIDC_DEPLOYMENT_ROLE_TYPE}$` +
          `${AWS_IAM_ROLE_TYPE}::deploy-role-role`,
      },
    ],
  ])("rejects an IAM role with %s", (_label, overrides) => {
    expect(runDeployGov1(deploymentTuple(overrides))).toHaveLength(1);
  });

  it.each([
    ["malformed trust", "not-json", undefined],
    ["wrong subject", trustPolicy({ environment: "dev" }), undefined],
    [
      "wrong workflow",
      trustPolicy({ workflowRef: WORKFLOW_REF.replace("deploy.yml", "other.yml") }),
      undefined,
    ],
    ["wrong audience", trustPolicy({ audience: "example.invalid" }), undefined],
    ["wrong provider", trustPolicy({ providerArn: `${OIDC_PROVIDER_ARN}.evil` }), undefined],
    ["wrong action", trustPolicy({ action: "sts:AssumeRole" }), undefined],
    ["additional Allow statement", trustPolicy({ extraStatement: true }), undefined],
    [
      "wrong role tags",
      trustPolicy(),
      {
        "hulumi:component": "GitHubAwsOidcDeploymentRole",
        "hulumi:github-repository": `${OWNER}/${REPOSITORY}`,
        "hulumi:github-environment": "dev",
      },
    ],
  ])("rejects %s even when component props match", (_label, iamTrust, iamTags) => {
    expect(
      runDeployGov1(deploymentTuple({ iamTrust, ...(iamTags ? { iamTags } : {}) })),
    ).toHaveLength(1);
  });

  it("rejects a ref-mode role as evidence for a protected environment", () => {
    expect(
      runDeployGov1(
        deploymentTuple({
          componentProps: {
            environment: undefined,
            subjectMode: { kind: "ref", ref: "refs/heads/main" },
          },
        }),
      ),
    ).toHaveLength(1);
  });

  it("rejects matching foundation presence without the exact environment and role tuple", () => {
    const [repo] = deploymentTuple();
    const foundation = makePolicyResource({
      type: DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE,
      urn: `urn:pulumi:s::p::${DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE}::deploy-foundation`,
      name: "deploy-foundation",
      props: { owner: OWNER, name: REPOSITORY, environments: [] },
    });
    expect(runDeployGov1([repo, foundation])).toHaveLength(1);
  });

  it("rejects component-child ancestry without the exact environment and role tuple", () => {
    const repo = makePolicyResource({
      type: GITHUB_REPOSITORY_TYPE,
      urn:
        `urn:pulumi:s::p::${DEPLOYMENT_REPOSITORY_FOUNDATION_TYPE}$` +
        `hulumi:baseline:github:SecureRepository$${GITHUB_REPOSITORY_TYPE}::${REPOSITORY}`,
      name: REPOSITORY,
      props: { name: REPOSITORY, topics: ["deployment"] },
    });
    expect(runDeployGov1([repo])).toHaveLength(1);
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
