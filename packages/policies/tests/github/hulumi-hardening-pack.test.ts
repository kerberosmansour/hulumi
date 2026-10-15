// BDD scenarios for @hulumi/policies/github.HulumiGithubHardeningPack.
// H1 (no raw github.Repository) + H2 (bound OIDC subject identity) + H3
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
            urnScope: "urn:pulumi:s::p::github:index/repository:Repository::legacy-repo",
            expiresAt: "2999-01-01T00:00:00Z",
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

describe("HulumiGithubHardeningPack H2 — requires bound OIDC subject identity", () => {
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

  it("still reports an unsafe OIDC template when it claims OrgFoundation ancestry", () => {
    const args = makeResourceArgs({
      type: TEMPLATE_TYPE,
      urn: `urn:pulumi:s::p::hulumi:baseline:github:OrgFoundation$${TEMPLATE_TYPE}::sb-tmpl`,
      name: "sb-tmpl",
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

  it.each(["repo", "job_workflow_ref", "environment"])(
    "reports HULUMI-H2 when a template omits required %s identity",
    (missingAxis) => {
      const args = makeResourceArgs({
        type: TEMPLATE_TYPE,
        urn: `urn:pulumi:s::p::${TEMPLATE_TYPE}::missing-${missingAxis}`,
        name: `missing-${missingAxis}`,
        props: {
          includeClaimKeys: ["repo", "job_workflow_ref", "environment", "context"].filter(
            (axis) => axis !== missingAxis,
          ),
        },
      });
      (
        h2NoWildcardOidcTemplate.validateResource as (
          a: ResourceValidationArgs,
          r: (m: string) => void,
        ) => void
      )(args, report);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toMatch(/missing required/i);
      expect(violations[0]).toContain(missingAxis);
    },
  );

  it.each([
    { name: "missing property", props: {} },
    { name: "non-array property", props: { includeClaimKeys: "repo" } },
    { name: "empty array", props: { includeClaimKeys: [] } },
    {
      name: "non-string entry",
      props: { includeClaimKeys: ["repo", "job_workflow_ref", "environment", 42] },
    },
    {
      name: "duplicate key",
      props: { includeClaimKeys: ["repo", "job_workflow_ref", "environment", "repo"] },
    },
    {
      name: "invalid key syntax",
      props: { includeClaimKeys: ["repo", "job_workflow_ref", "environment", "actor-id"] },
    },
  ])("fails closed for $name", ({ name, props }) => {
    const args = makeResourceArgs({
      type: TEMPLATE_TYPE,
      urn: `urn:pulumi:s::p::${TEMPLATE_TYPE}::${name.replaceAll(" ", "-")}`,
      name,
      props,
    });
    (
      h2NoWildcardOidcTemplate.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H2/);
  });

  it("accepts a safe custom superset without reordering its claim keys", () => {
    const args = makeResourceArgs({
      type: TEMPLATE_TYPE,
      urn: `urn:pulumi:s::p::${TEMPLATE_TYPE}::safe-superset`,
      name: "safe-superset",
      props: {
        includeClaimKeys: ["repository_id", "environment", "repo", "job_workflow_ref", "context"],
      },
    });
    (
      h2NoWildcardOidcTemplate.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toEqual([]);
  });

  it("preserves an exact scoped HULUMI-H2 suppression", () => {
    const urn = `urn:pulumi:s::p::${TEMPLATE_TYPE}::legacy-template`;
    const args = makeResourceArgs({
      type: TEMPLATE_TYPE,
      urn,
      name: "legacy-template",
      props: { includeClaimKeys: ["repo"] },
      getConfig: (() => ({
        suppressions: [
          {
            ruleId: "HULUMI-H2",
            reason: "Time-bounded migration tracked in issue #N",
            urnScope: urn,
            expiresAt: "2999-01-01T00:00:00Z",
          },
        ],
      })) as ResourceValidationArgs["getConfig"],
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
  const safeEnvironmentSubject =
    "repo:org/repo:environment:prod:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main";
  const safeRefSubject =
    "repo:org/repo:ref:refs/heads/main:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main";
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  const githubStatement = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    Effect: "Allow",
    Principal: {
      Federated: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
    },
    Action: "sts:AssumeRoleWithWebIdentity",
    Condition: {
      StringEquals: {
        "token.actions.githubusercontent.com:sub": safeEnvironmentSubject,
      },
    },
    ...overrides,
  });

  const inspectAwsTrust = (assumeRolePolicy: unknown): string[] => {
    const messages: string[] = [];
    const args = makeResourceArgs({
      type: G_OIDC_1_AWS_IAM_ROLE_TYPE,
      urn: "urn:pulumi:s::p::aws:iam/role:Role::structural-role",
      name: "structural-role",
      props: { assumeRolePolicy },
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      (message) => messages.push(message),
    );
    return messages;
  };

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

  it.each([
    ["branch-only", "repo:org/repo:ref:refs/heads/main"],
    ["environment-only", "repo:org/repo:environment:prod"],
    [
      "workflow without a context",
      "repo:org/repo:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main",
    ],
    ["both environment and ref contexts", `${safeEnvironmentSubject}:ref:refs/heads/main`],
    [
      "pull-request ref context",
      "repo:org/repo:ref:pull_request:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main",
    ],
    [
      "non-refs ref context",
      "repo:org/repo:ref:main:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main",
    ],
    [
      "malformed workflow path",
      "repo:org/repo:environment:prod:job_workflow_ref:org/repo/deploy.yml@refs/heads/main",
    ],
  ])("rejects AWS IAM trust with %s subject", (_label, subject) => {
    expect(
      inspectAwsTrust({
        Version: "2012-10-17",
        Statement: [
          githubStatement({
            Condition: {
              StringEquals: { "token.actions.githubusercontent.com:sub": subject },
            },
          }),
        ],
      }),
    ).toHaveLength(1);
  });

  it.each(["ForAnyValue:StringEquals", "ForAllValues:StringEquals", "StringEqualsIfExists"])(
    "rejects exact three-axis AWS subject under %s",
    (operator) => {
      const messages = inspectAwsTrust({
        Version: "2012-10-17",
        Statement: [
          githubStatement({
            Condition: {
              [operator]: { "token.actions.githubusercontent.com:sub": safeEnvironmentSubject },
            },
          }),
        ],
      });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain(operator);
    },
  );

  it("rejects alternative AWS subjects in a StringEquals array", () => {
    expect(
      inspectAwsTrust({
        Version: "2012-10-17",
        Statement: [
          githubStatement({
            Condition: {
              StringEquals: {
                "token.actions.githubusercontent.com:sub": [safeEnvironmentSubject, safeRefSubject],
              },
            },
          }),
        ],
      }),
    ).toHaveLength(1);
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

  it("rejects a singleton GitHub OIDC Statement that uses StringLike", () => {
    expect(
      inspectAwsTrust({
        Version: "2012-10-17",
        Statement: githubStatement({
          Condition: {
            StringLike: { "token.actions.githubusercontent.com:sub": "repo:org/repo:*" },
          },
        }),
      }),
    ).toHaveLength(1);
  });

  it.each([
    ["missing Condition", undefined],
    ["empty Condition", {}],
    [
      "missing sub claim",
      { StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" } },
    ],
    [
      "unsupported operator",
      {
        NumericEquals: {
          "token.actions.githubusercontent.com:sub": "repo:org/repo:environment:prod",
        },
      },
    ],
    [
      "fabricated StringEquals qualifier",
      {
        "Bogus:StringEquals": {
          "token.actions.githubusercontent.com:sub": "repo:org/repo:environment:prod",
        },
      },
    ],
    ["non-string claim", { StringEquals: { "token.actions.githubusercontent.com:sub": 7 } }],
    [
      "mixed claim array",
      {
        StringEquals: {
          "token.actions.githubusercontent.com:sub": ["repo:org/repo:environment:prod", 7],
        },
      },
    ],
    [
      "duplicate restrictions",
      {
        StringEquals: {
          "token.actions.githubusercontent.com:sub": "repo:org/repo:environment:prod",
        },
        "ForAnyValue:StringEquals": {
          "token.actions.githubusercontent.com:sub": "repo:org/repo:ref:refs/heads/main",
        },
      },
    ],
  ])("fails closed when a GitHub OIDC statement has %s", (_label, Condition) => {
    expect(
      inspectAwsTrust({
        Version: "2012-10-17",
        Statement: [githubStatement({ Condition })],
      }),
    ).toHaveLength(1);
  });

  it.each([
    ["malformed JSON", "{"],
    ["missing Statement", JSON.stringify({ Version: "2012-10-17" })],
    ["invalid Statement scalar", JSON.stringify({ Version: "2012-10-17", Statement: 7 })],
  ])("fails closed on an uninspectable IAM trust policy: %s", (_label, policy) => {
    expect(inspectAwsTrust(policy)).toHaveLength(1);
  });

  it("does NOT require a GitHub sub condition on a parsed non-GitHub trust statement", () => {
    expect(
      inspectAwsTrust({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "ec2.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    ).toHaveLength(0);
  });

  it.each(["ForAnyValue:StringLike", "ForAllValues:StringLike", "StringLikeIfExists"])(
    "rejects AWS IAM trust policy with set/suffix-qualified %s on the GitHub sub axis",
    (operator) => {
      const args = makeResourceArgs({
        type: G_OIDC_1_AWS_IAM_ROLE_TYPE,
        urn: `urn:pulumi:s::p::aws:iam/role:Role::${operator.replace(/[^A-Za-z]/g, "-")}-role`,
        name: "set-qualified-like-role",
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
                  [operator]: {
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
      expect(violations[0]).toContain(operator);
    },
  );

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

  it("does NOT treat a crafted look-alike OIDC-provider host as GitHub (anchored, #165)", () => {
    for (const federated of [
      "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com.evil.com",
      "arn:aws:iam::123456789012:oidc-provider/evil.com/token.actions.githubusercontent.com",
    ]) {
      violations = [];
      const args = makeResourceArgs({
        type: G_OIDC_1_AWS_IAM_ROLE_TYPE,
        urn: "urn:pulumi:s::p::aws:iam/role:Role::lookalike-role",
        name: "lookalike-role",
        props: {
          assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Federated: federated },
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
      expect(violations).toHaveLength(0);
    }
  });

  it("rejects AWS IAM trust policy with an array Principal.Federated listing the GitHub provider (#170)", () => {
    const args = makeResourceArgs({
      type: G_OIDC_1_AWS_IAM_ROLE_TYPE,
      urn: "urn:pulumi:s::p::aws:iam/role:Role::array-fed-role",
      name: "array-fed-role",
      props: {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Federated: [
                  "arn:aws:iam::123456789012:oidc-provider/accounts.google.com",
                  "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
                ],
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
  });

  it("rejects AWS IAM trust policy with set-qualified StringEquals + wildcard sub value", () => {
    const args = makeResourceArgs({
      type: G_OIDC_1_AWS_IAM_ROLE_TYPE,
      urn: "urn:pulumi:s::p::aws:iam/role:Role::set-qualified-equals-role",
      name: "set-qualified-equals-role",
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
                "ForAnyValue:StringEquals": {
                  "token.actions.githubusercontent.com:sub": "repo:org/*",
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
    expect(violations[0]).toMatch(/ForAnyValue:StringEquals/);
  });

  it.each([safeEnvironmentSubject, safeRefSubject])(
    "does NOT report on AWS IAM trust policy with one safe three-axis sub: %s",
    (subject) => {
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
                    "token.actions.githubusercontent.com:sub": subject,
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
    },
  );

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

  it.each([
    ["missing subject", {}],
    ["non-string subject", { subject: 7 }],
    ["empty subject", { subject: "" }],
    ["repo only", { subject: "repo:org/repo" }],
    ["missing workflow", { subject: "repo:org/repo:environment:prod" }],
    [
      "missing environment",
      {
        subject:
          "repo:org/repo:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main",
      },
    ],
    [
      "duplicate repo",
      {
        subject:
          "repo:org/repo:repo:other/repo:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main:environment:prod",
      },
    ],
    ["odd key/value shape", { subject: "repo:org/repo:job_workflow_ref" }],
  ])("fails closed on Azure federated credential with %s", (_label, props) => {
    const args = makeResourceArgs({
      type: G_OIDC_1_AZURE_FEDERATED_CRED_TYPE,
      urn: `urn:pulumi:s::p::${G_OIDC_1_AZURE_FEDERATED_CRED_TYPE}::azure-cred`,
      name: "azure-cred",
      props,
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/Azure|subject/);
  });

  it("accepts an Azure subject with the three required axes and a safe extra claim", () => {
    const args = makeResourceArgs({
      type: G_OIDC_1_AZURE_FEDERATED_CRED_TYPE,
      urn: `urn:pulumi:s::p::${G_OIDC_1_AZURE_FEDERATED_CRED_TYPE}::azure-cred`,
      name: "azure-cred",
      props: {
        subject:
          "repository_id:123456:repo:org/repo:job_workflow_ref:org/repo/.github/workflows/deploy.yml@refs/heads/main:environment:prod",
      },
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      report,
    );
    expect(violations).toEqual([]);
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

  it.each([
    ["missing condition", {}],
    ["non-string condition", { attributeCondition: 7 }],
    ["empty condition", { attributeCondition: "" }],
    ["constant true", { attributeCondition: "true" }],
    ["repository only", { attributeCondition: "assertion.repository == 'org/repo'" }],
    [
      "missing workflow",
      {
        attributeCondition: "assertion.repository == 'org/repo' && assertion.environment == 'prod'",
      },
    ],
    [
      "missing environment",
      {
        attributeCondition:
          "assertion.repository == 'org/repo' && assertion.job_workflow_ref == 'org/repo/.github/workflows/deploy.yml@refs/heads/main'",
      },
    ],
    [
      "disjunction",
      {
        attributeCondition:
          "assertion.repository == 'org/repo' || assertion.job_workflow_ref == 'org/repo/.github/workflows/deploy.yml@refs/heads/main' || assertion.environment == 'prod'",
      },
    ],
    [
      "tautological suffix",
      {
        attributeCondition:
          "assertion.repository == 'org/repo' && assertion.job_workflow_ref == 'org/repo/.github/workflows/deploy.yml@refs/heads/main' && assertion.environment == 'prod' || true",
      },
    ],
    [
      "function call",
      {
        attributeCondition:
          "assertion.repository.startsWith('org/') && assertion.job_workflow_ref == 'org/repo/.github/workflows/deploy.yml@refs/heads/main' && assertion.environment == 'prod'",
      },
    ],
    [
      "duplicate repository binding",
      {
        attributeCondition:
          "assertion.repository == 'org/repo' && assertion.repository == 'other/repo' && assertion.job_workflow_ref == 'org/repo/.github/workflows/deploy.yml@refs/heads/main' && assertion.environment == 'prod'",
      },
    ],
  ])("fails closed on GCP Workload Identity Pool Provider with %s", (_label, props) => {
    const args = makeResourceArgs({
      type: G_OIDC_1_GCP_WIF_PROVIDER_TYPE,
      urn: `urn:pulumi:s::p::${G_OIDC_1_GCP_WIF_PROVIDER_TYPE}::gcp-wif`,
      name: "gcp-wif",
      props,
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/GCP|attributeCondition/);
  });

  it("accepts a parenthesized GCP conjunction with required and safe extra exact bindings", () => {
    const args = makeResourceArgs({
      type: G_OIDC_1_GCP_WIF_PROVIDER_TYPE,
      urn: `urn:pulumi:s::p::${G_OIDC_1_GCP_WIF_PROVIDER_TYPE}::gcp-wif`,
      name: "gcp-wif",
      props: {
        attributeCondition:
          "(assertion.repository == 'org/repo' && 'org/repo/.github/workflows/deploy.yml@refs/heads/main' == assertion.job_workflow_ref) && (assertion.environment == \"prod\" && assertion.repository_id == '123456')",
      },
    });
    (G_OIDC_1.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
      args,
      report,
    );
    expect(violations).toEqual([]);
  });

  it("h3NoWildcardTrustPolicy is the same rule under the H3 alias", () => {
    expect(h3NoWildcardTrustPolicy.name).toBe("HULUMI-H3-no-wildcard-trust-policy");
    expect(h3NoWildcardTrustPolicy.enforcementLevel).toBe("mandatory");
    expect(h3NoWildcardTrustPolicy.validateResource).toBe(G_OIDC_1.validateResource);
  });
});

// Cluster B regression — `isChildOfSecureRepository` / `isChildOfOrgFoundation`
// used `urn.includes(\`${type}$\`)` over the full URN. An attacker-controlled
// logical name embedding the parent type token bypassed H1 / H2 entirely.
describe("HulumiGithubHardeningPack — forged-logical-name URN spoof", () => {
  let violations: string[];
  const report = (m: string): void => {
    violations.push(m);
  };

  beforeEach(() => {
    violations = [];
  });

  it("H1 still reports a raw github.Repository whose LOGICAL NAME embeds SecureRepository type", () => {
    // Spoof: raw github.Repository with logical name
    // `hulumi:baseline:github:SecureRepository$victim`. URN contains the
    // type token via the logical-name suffix; type chain is just
    // `github:index/repository:Repository`.
    const args = makeResourceArgs({
      type: "github:index/repository:Repository",
      urn: "urn:pulumi:s::p::github:index/repository:Repository::hulumi:baseline:github:SecureRepository$victim",
      name: "hulumi:baseline:github:SecureRepository$victim",
      props: { name: "victim-repo" },
    });

    (
      h1NoRawGithubRepository.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H1/);
  });

  it("H2 still reports a wildcard OIDC template whose LOGICAL NAME embeds OrgFoundation type", () => {
    // Spoof on H2's wildcard guard — same forged-logical-name trick.
    const args = makeResourceArgs({
      type: "github:index/actionsOrganizationOidcSubjectClaimCustomizationTemplate:ActionsOrganizationOidcSubjectClaimCustomizationTemplate",
      urn: "urn:pulumi:s::p::github:index/actionsOrganizationOidcSubjectClaimCustomizationTemplate:ActionsOrganizationOidcSubjectClaimCustomizationTemplate::hulumi:baseline:github:OrgFoundation$spoof",
      name: "hulumi:baseline:github:OrgFoundation$spoof",
      // Wildcard claim — H2's mandatory rejection axis. Pre-fix, the URN's
      // logical-name spoof made `isChildOfOrgFoundation` return true via
      // substring match, so H2 early-returned and the wildcard was never
      // inspected. Post-fix, the anchored check returns false (template's
      // type chain is not under any real OrgFoundation), and the wildcard
      // is reported as it should be.
      props: { includeClaimKeys: ["*"] },
    });

    (
      h2NoWildcardOidcTemplate.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations.length).toBeGreaterThanOrEqual(1);
    expect(violations[0]).toMatch(/HULUMI-H2/);
  });
});
