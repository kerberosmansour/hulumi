// BDD scenarios for @hulumi/policies/github.HulumiGithubHardeningPack.
// H1 (no raw github.Repository) + H2 (no wildcard OIDC template) + H3
// (= G_OIDC_1, AWS/Azure/GCP trust-policy guard).

import { describe, it, expect, beforeEach } from "vitest";
import type { ResourceValidationArgs } from "@pulumi/policy";

import {
  h1NoRawGithubRepository,
  h2NoWildcardOidcTemplate,
  h3NoWildcardTrustPolicy,
  G_OIDC_1,
  G_OIDC_1_AWS_IAM_ROLE_TYPE,
  G_OIDC_1_AZURE_FEDERATED_CRED_TYPE,
  G_OIDC_1_GCP_WIF_PROVIDER_TYPE,
  subClaimIsUnsafe,
} from "../../src/github";

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

describe("HulumiGithubHardeningPack H1 — blocks raw github.Repository (tm-hulumi-github-abuse-raw-repo-rejected)", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("reports HULUMI-H1 when a raw github.Repository has no SecureRepository ancestor in its URN", () => {
    const args = makeResourceArgs({
      type: "github:index/repository:Repository",
      urn: "urn:pulumi:s::p::github:index/repository:Repository::raw-repo",
      name: "raw-repo",
    });
    (
      h1NoRawGithubRepository.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H1/);
    expect(violations[0]).toMatch(/SecureRepository/);
  });

  it("does NOT report when github.Repository is a child of SecureRepository", () => {
    const args = makeResourceArgs({
      type: "github:index/repository:Repository",
      urn: "urn:pulumi:s::p::hulumi:baseline:github:SecureRepository$github:index/repository:Repository::sb-repo",
      name: "sb-repo",
    });
    (
      h1NoRawGithubRepository.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toEqual([]);
  });

  it("respects suppressions configured via getConfig", () => {
    const args = makeResourceArgs({
      type: "github:index/repository:Repository",
      urn: "urn:pulumi:s::p::github:index/repository:Repository::legacy-repo",
      name: "legacy-repo",
      getConfig: (() => ({
        suppressions: [
          {
            ruleId: "HULUMI-H1",
            reason: "Legacy repo migration in progress; tracked in issue #N",
            urnScope: "*",
          },
        ],
      })) as ResourceValidationArgs["getConfig"],
    });
    (
      h1NoRawGithubRepository.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toEqual([]);
  });
});

describe("HulumiGithubHardeningPack H2 — blocks wildcard OIDC template", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  const TEMPLATE_TYPE =
    "github:index/actionsOrganizationOidcSubjectClaimCustomizationTemplate:ActionsOrganizationOidcSubjectClaimCustomizationTemplate";

  it("reports HULUMI-H2 when a raw OIDC template uses a wildcard claim key", () => {
    const args = makeResourceArgs({
      type: TEMPLATE_TYPE,
      urn: `urn:pulumi:s::p::${TEMPLATE_TYPE}::raw-tmpl`,
      name: "raw-tmpl",
      props: { includeClaimKeys: ["repo", "*"] },
    });
    (
      h2NoWildcardOidcTemplate.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H2/);
    expect(violations[0]).toMatch(/UNC6426/);
  });

  it("does NOT report when OIDC template is a child of OrgFoundation (parent already runtime-checked)", () => {
    const args = makeResourceArgs({
      type: TEMPLATE_TYPE,
      urn: `urn:pulumi:s::p::hulumi:baseline:github:OrgFoundation$${TEMPLATE_TYPE}::sb-tmpl`,
      name: "sb-tmpl",
      props: { includeClaimKeys: ["repo", "*"] }, // would fail H2 if checked, but child of OrgFoundation
    });
    (
      h2NoWildcardOidcTemplate.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toEqual([]);
  });

  it("does NOT report when claim keys are the three-axis safe shape", () => {
    const args = makeResourceArgs({
      type: TEMPLATE_TYPE,
      urn: `urn:pulumi:s::p::${TEMPLATE_TYPE}::safe-tmpl`,
      name: "safe-tmpl",
      props: { includeClaimKeys: ["repo", "context", "job_workflow_ref", "environment"] },
    });
    (
      h2NoWildcardOidcTemplate.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toEqual([]);
  });
});

describe("G_OIDC_1 / HULUMI-H3 — wildcard rejection across AWS/Azure/GCP", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("subClaimIsUnsafe returns true for wildcards and empty strings, false for safe shapes", () => {
    expect(subClaimIsUnsafe("repo:org/repo:*")).toBe(true);
    expect(subClaimIsUnsafe("*")).toBe(true);
    expect(subClaimIsUnsafe("")).toBe(true);
    expect(
      subClaimIsUnsafe(
        "repo:org/repo:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main:environment:prod",
      ),
    ).toBe(false);
  });

  it("rejects AWS IAM trust policy with StringLike on the GitHub sub axis", () => {
    const args = makeResourceArgs({
      type: G_OIDC_1_AWS_IAM_ROLE_TYPE,
      urn: "urn:pulumi:s::p::aws:iam/role:Role::deploy-role",
      name: "deploy-role",
      props: {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Federated:
                  "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
              },
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition: {
                StringLike: {
                  "token.actions.githubusercontent.com:sub": "repo:org/repo:*",
                },
              },
            },
          ],
        }),
      },
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/G_OIDC_1/);
    expect(violations[0]).toMatch(/StringLike/);
  });

  it("rejects AWS IAM trust policy with StringEquals + wildcard sub value", () => {
    const args = makeResourceArgs({
      type: G_OIDC_1_AWS_IAM_ROLE_TYPE,
      urn: "urn:pulumi:s::p::aws:iam/role:Role::wildcard-role",
      name: "wildcard-role",
      props: {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Federated:
                  "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
              },
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition: {
                StringEquals: {
                  "token.actions.githubusercontent.com:sub": "repo:org/repo:*",
                },
              },
            },
          ],
        }),
      },
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/wildcard|UNC6426/);
  });

  it("does NOT report on AWS IAM trust policy with StringEquals + safe three-axis sub", () => {
    const args = makeResourceArgs({
      type: G_OIDC_1_AWS_IAM_ROLE_TYPE,
      urn: "urn:pulumi:s::p::aws:iam/role:Role::safe-role",
      name: "safe-role",
      props: {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Federated:
                  "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
              },
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition: {
                StringEquals: {
                  "token.actions.githubusercontent.com:sub":
                    "repo:org/repo:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main:environment:prod",
                },
              },
            },
          ],
        }),
      },
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      report,
    );
    expect(violations).toEqual([]);
  });

  it("rejects Azure federated credential with wildcard subject", () => {
    const args = makeResourceArgs({
      type: G_OIDC_1_AZURE_FEDERATED_CRED_TYPE,
      urn: `urn:pulumi:s::p::${G_OIDC_1_AZURE_FEDERATED_CRED_TYPE}::azure-cred`,
      name: "azure-cred",
      props: { subject: "repo:org/repo:*" },
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/Azure|federated/);
  });

  it("rejects GCP Workload Identity Pool Provider with wildcard attributeCondition", () => {
    const args = makeResourceArgs({
      type: G_OIDC_1_GCP_WIF_PROVIDER_TYPE,
      urn: `urn:pulumi:s::p::${G_OIDC_1_GCP_WIF_PROVIDER_TYPE}::gcp-wif`,
      name: "gcp-wif",
      props: { attributeCondition: "assertion.repository == '*'" },
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/GCP|Workload/);
  });

  it("h3NoWildcardTrustPolicy is the same rule under the H3 alias", () => {
    expect(h3NoWildcardTrustPolicy.name).toBe("HULUMI-H3-no-wildcard-trust-policy");
    expect(h3NoWildcardTrustPolicy.enforcementLevel).toBe("mandatory");
    expect(h3NoWildcardTrustPolicy.validateResource).toBe(G_OIDC_1.validateResource);
  });
});
