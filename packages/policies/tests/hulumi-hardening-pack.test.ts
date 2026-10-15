// BDD scenarios for @hulumi/policies.HulumiHardeningPack. Each describe
// block corresponds to one row of M2's BDD Acceptance Scenarios table
// (docs/slo/runbook-milestones/hulumi-m2.md) covering H1 / H2 / H3 / H4 and
// Suppression behaviour. Policies are invoked directly via their exported
// validateResource / validateStack handlers so we don't need a running
// Pulumi engine.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { ResourceValidationArgs, StackValidationArgs, PolicyResource } from "@pulumi/policy";

import {
  h1BlocksRawBucket,
  h2BlocksUnencryptedStateBackend,
  h3AdvisoryIacRoleTag,
  h4StartupHardenedRequiresLogging,
  h5SecureBucketExemptionRequiresHardening,
  state1ApprovedSecretsProvider,
  primitive1GithubOidcNoWildcard,
  primitive2SecretPolicyNoBroadAccess,
  primitive3LaunchTemplateImdsv2Required,
  primitive4StartupRolePermissionBoundaryRequired,
  H3_ENFORCEMENT_LEVEL,
  hulumiHardeningPackMetadata,
  matchSuppression,
} from "../src";

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

function makeStackArgs(
  resources: PolicyResource[],
  config: Record<string, unknown> = {},
): StackValidationArgs {
  return {
    resources,
    getConfig: (() => config) as StackValidationArgs["getConfig"],
  } as StackValidationArgs;
}

function bucketPropertyDependencies(
  bucket: PolicyResource,
  ...propertyNames: string[]
): Record<string, PolicyResource[]> {
  return Object.fromEntries(propertyNames.map((propertyName) => [propertyName, [bucket]]));
}

describe("HulumiHardeningPack H1 — blocks raw aws.s3.BucketV2 (security S5)", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("reports HULUMI-H1 when a raw aws.s3.BucketV2 has no SecureBucket ancestor in its URN", () => {
    const args = makeResourceArgs({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::raw-bucket",
      name: "raw-bucket",
    });
    (
      h1BlocksRawBucket.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H1/);
    expect(violations[0]).toMatch(/SecureBucket/);
  });

  it("reports HULUMI-H1 for aws.s3.Bucket (non-V2 name) as well", () => {
    const args = makeResourceArgs({
      type: "aws:s3/bucket:Bucket",
      urn: "urn:pulumi:s::p::aws:s3/bucket:Bucket::raw-bucket",
      name: "raw-bucket",
    });
    (
      h1BlocksRawBucket.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H1/);
  });

  it("does NOT report when the bucket is the managed <component>-bucket child of SecureBucket", () => {
    const args = makeResourceArgs({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucketV2:BucketV2::sb-bucket",
      name: "sb-bucket",
    });
    (
      h1BlocksRawBucket.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("does NOT report when the non-V2 bucket is the managed <component>-bucket child of SecureBucket", () => {
    const args = makeResourceArgs({
      type: "aws:s3/bucket:Bucket",
      urn: "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucket:Bucket::sb-bucket",
      name: "sb-bucket",
    });
    (
      h1BlocksRawBucket.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("reports HULUMI-H1 when a raw BucketV2 is parented by SecureBucket but not named <component>-bucket", () => {
    const args = makeResourceArgs({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket::sb$aws:s3/bucketV2:BucketV2::attacker-raw-bucket",
      name: "attacker-raw-bucket",
    });
    (
      h1BlocksRawBucket.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H1/);
  });

  it("does NOT report on non-bucket resources", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::my-role",
      name: "my-role",
    });
    (
      h1BlocksRawBucket.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("HulumiHardeningPack primitive backstops", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("flags wildcard GitHub OIDC trust on AWS roles", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::deploy",
      name: "deploy",
      props: {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Federated:
                  "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com",
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

    (
      primitive1GithubOidcNoWildcard.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("PRIM-1");
  });

  it.each([
    {},
    { StringEquals: { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" } },
    { StringEquals: { "token.actions.githubusercontent.com:sub": [] } },
    { StringEquals: { "token.actions.githubusercontent.com:sub": "" } },
    {
      StringEqualsIfExists: {
        "token.actions.githubusercontent.com:sub": "repo:org/repo:ref:refs/heads/main",
      },
    },
    {
      "ForAllValues:StringEquals": {
        "token.actions.githubusercontent.com:sub": "repo:org/repo:ref:refs/heads/main",
      },
    },
  ])("rejects missing or optional subject restrictions: %j", (Condition) => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::deploy",
      name: "deploy",
      props: {
        assumeRolePolicy: JSON.stringify({
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Federated:
                  "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com",
              },
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition,
            },
          ],
        }),
      },
    });
    (
      primitive1GithubOidcNoWildcard.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
  });

  it("does not treat spoofed GitHub OIDC host substrings as GitHub OIDC trust", () => {
    for (const federated of [
      "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com.evil.com",
      "arn:aws:iam::111122223333:oidc-provider/evil.com/token.actions.githubusercontent.com",
    ]) {
      const args = makeResourceArgs({
        type: "aws:iam/role:Role",
        urn: "urn:pulumi:s::p::aws:iam/role:Role::deploy",
        name: "deploy",
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

      (
        primitive1GithubOidcNoWildcard.validateResource as (
          a: ResourceValidationArgs,
          r: (m: string) => void,
        ) => void
      )(args, report);
    }

    expect(violations).toHaveLength(0);
  });

  it("flags broad Secrets Manager resource policies", () => {
    const args = makeResourceArgs({
      type: "aws:secretsmanager/secretPolicy:SecretPolicy",
      urn: "urn:pulumi:s::p::aws:secretsmanager/secretPolicy:SecretPolicy::secret-policy",
      name: "secret-policy",
      props: {
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: "*",
              Action: "secretsmanager:GetSecretValue",
              Resource: "*",
            },
          ],
        }),
      },
    });

    (
      primitive2SecretPolicyNoBroadAccess.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("PRIM-2");
  });

  it("flags launch templates without IMDSv2 required", () => {
    const args = makeResourceArgs({
      type: "aws:ec2/launchTemplate:LaunchTemplate",
      urn: "urn:pulumi:s::p::aws:ec2/launchTemplate:LaunchTemplate::lt",
      name: "lt",
      props: { metadataOptions: { httpTokens: "optional" } },
    });

    (
      primitive3LaunchTemplateImdsv2Required.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("PRIM-3");
  });

  it("flags startup-hardened primitive IAM roles without permission boundaries", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::workload",
      name: "workload",
      props: {
        tags: {
          "hulumi:component": "SecureIamDeploymentRole",
          "hulumi:tier": "startup-hardened",
        },
      },
    });

    (
      primitive4StartupRolePermissionBoundaryRequired.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("PRIM-4");
  });
});

describe("HulumiHardeningPack H2 — blocks file:// state backend and unencrypted S3 (security S5)", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };
  let prevBackend: string | undefined;

  beforeEach(() => {
    violations = [];
    prevBackend = process.env.PULUMI_BACKEND_URL;
  });

  afterEach(() => {
    if (prevBackend === undefined) delete process.env.PULUMI_BACKEND_URL;
    else process.env.PULUMI_BACKEND_URL = prevBackend;
  });

  it("reports HULUMI-H2 (mandatory) when backend is file://", () => {
    process.env.PULUMI_BACKEND_URL = "file:///tmp/my-state";
    const args = makeStackArgs([]);
    (
      h2BlocksUnencryptedStateBackend.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H2/);
    expect(violations[0]).toMatch(/file:\/\//);
  });

  it("reports HULUMI-H2 (mandatory) when backend is s3:// pointing at a stack bucket that has no SSE sibling", () => {
    process.env.PULUMI_BACKEND_URL = "s3://state-bucket/state-key";
    const bucket = makePolicyResource({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::state-bucket",
      name: "state-bucket",
      props: { bucket: "state-bucket" },
    });
    const args = makeStackArgs([bucket]);
    (
      h2BlocksUnencryptedStateBackend.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H2/);
    expect(violations[0]).toMatch(/no BucketServerSideEncryptionConfiguration sibling/);
  });

  it("emits H2 advisory when backend is s3:// but the referenced bucket is not in the stack (encryption not verifiable)", () => {
    process.env.PULUMI_BACKEND_URL = "s3://external-state-bucket/k";
    const args = makeStackArgs([]);
    (
      h2BlocksUnencryptedStateBackend.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H2 advisory/);
    expect(violations[0]).toMatch(/not present in the current stack/);
  });

  it("is silent when backend URL is unset (nothing to validate)", () => {
    delete process.env.PULUMI_BACKEND_URL;
    const args = makeStackArgs([]);
    (
      h2BlocksUnencryptedStateBackend.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("is silent when backend is s3:// and the bucket has a sibling SSE config", () => {
    process.env.PULUMI_BACKEND_URL = "s3://ok-state-bucket/k";
    const bucket = makePolicyResource({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::ok-state-bucket",
      name: "ok-state-bucket",
      props: { bucket: "ok-state-bucket", id: "ok-state-bucket" },
    });
    const sse = makePolicyResource({
      type: "aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2",
      urn: "urn:pulumi:s::p::aws:s3/bucketServerSideEncryptionConfigurationV2:BucketServerSideEncryptionConfigurationV2::ok-state-bucket-sse",
      name: "ok-state-bucket-sse",
      props: { bucket: "ok-state-bucket" },
    });
    const args = makeStackArgs([bucket, sse]);
    (
      h2BlocksUnencryptedStateBackend.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("HulumiHardeningPack STATE-1 — approved Pulumi secrets provider required", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  const runState1 = (config: Record<string, unknown>): void =>
    (
      state1ApprovedSecretsProvider.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs([], config), report);

  it("reports STATE-1 when the stack config omits the secrets provider", () => {
    runState1({});

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/STATE-1/);
    expect(violations[0]).toMatch(/approved Pulumi secrets provider/);
  });

  it("reports STATE-1 when passphrase is used instead of an approved KMS provider", () => {
    runState1({ pulumiSecretsProvider: "passphrase" });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/STATE-1/);
    expect(violations[0]).toMatch(/awskms:\/\//);
  });

  it("does NOT report when an AWS KMS secrets provider is configured", () => {
    runState1({ pulumiSecretsProvider: "awskms://alias/hulumi/state/example" });

    expect(violations).toHaveLength(0);
  });
});

describe("HulumiHardeningPack H3 — MANDATORY (M5 flip) on IAM role missing hulumi:iac-role=true tag", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("h3_prior_advisory_behavior_removed — H3 is now MANDATORY in v1.0.0 (paired with docs/deployment/scp.json)", () => {
    expect(H3_ENFORCEMENT_LEVEL).toBe("mandatory");
    expect(h3AdvisoryIacRoleTag.enforcementLevel).toBe("mandatory");
  });

  it("reports HULUMI-H3 when an IAM role has no tags at all", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::raw-role",
      name: "raw-role",
      props: {},
    });
    (
      h3AdvisoryIacRoleTag.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H3/);
  });

  it("does NOT report when the role carries hulumi:iac-role=true", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::tagged-role",
      name: "tagged-role",
      props: { tags: { "hulumi:iac-role": "true", Environment: "prod" } },
    });
    (
      h3AdvisoryIacRoleTag.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("reports when a Boundary role with the IaC tag is missing identity-kind", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::boundary-missing-kind",
      name: "boundary-missing-kind",
      props: {
        tags: {
          "hulumi:component": "BrokeredAuroraPostgresBoundary",
          "hulumi:iac-role": "true",
        },
      },
    });
    (
      h3AdvisoryIacRoleTag.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H3/);
    expect(violations[0]).toMatch(/recognized.*identity-kind/i);
  });

  it("reports when a Boundary role with the IaC tag has unknown identity-kind admin", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::boundary-admin-kind",
      name: "boundary-admin-kind",
      props: {
        tags: {
          "hulumi:component": "BrokeredAuroraPostgresBoundary",
          "hulumi:identity-kind": "admin",
          "hulumi:iac-role": "true",
        },
      },
    });
    (
      h3AdvisoryIacRoleTag.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H3/);
    expect(violations[0]).toMatch(/recognized.*identity-kind/i);
  });

  it("reports when a Boundary role without the IaC tag is missing identity-kind", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::boundary-untagged-missing-kind",
      name: "boundary-untagged-missing-kind",
      props: {
        tags: {
          "hulumi:component": "BrokeredAuroraPostgresBoundary",
        },
      },
    });
    (
      h3AdvisoryIacRoleTag.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/recognized.*identity-kind/i);
  });

  it("reports when a Boundary role without the IaC tag has an unknown identity-kind", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::boundary-untagged-unknown-kind",
      name: "boundary-untagged-unknown-kind",
      props: {
        tags: {
          "hulumi:component": "BrokeredAuroraPostgresBoundary",
          "hulumi:identity-kind": "admin",
        },
      },
    });
    (
      h3AdvisoryIacRoleTag.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/recognized.*identity-kind/i);
  });

  it("does NOT require the IaC attribution tag on a classified workload role", () => {
    for (const [name, tags] of [
      [
        "secure-workload-role",
        {
          "hulumi:component": "SecureWorkloadRole",
          "hulumi:identity-kind": "runtime",
        },
      ],
      [
        "boundary-runtime-role",
        {
          "hulumi:component": "BrokeredAuroraPostgresBoundary",
          "hulumi:identity-kind": "runtime",
        },
      ],
    ] as const) {
      violations = [];
      const args = makeResourceArgs({
        type: "aws:iam/role:Role",
        urn: `urn:pulumi:s::p::aws:iam/role:Role::${name}`,
        name,
        props: { tags },
      });
      (
        h3AdvisoryIacRoleTag.validateResource as (
          a: ResourceValidationArgs,
          r: (m: string) => void,
        ) => void
      )(args, report);
      expect(violations, name).toHaveLength(0);
    }
  });

  it("does not accept an identity-kind-only tag as workload-role classification", () => {
    const args = makeResourceArgs({
      type: "aws:iam/role:Role",
      urn: "urn:pulumi:s::p::aws:iam/role:Role::masquerading-deployment-role",
      name: "masquerading-deployment-role",
      props: {
        tags: {
          "hulumi:identity-kind": "runtime",
        },
      },
    });
    (
      h3AdvisoryIacRoleTag.validateResource as (
        a: ResourceValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/missing.*hulumi:iac-role=true/i);
  });

  it("reports when a classified workload role masquerades as an IaC role", () => {
    for (const kind of ["runtime", "broker", "migrator", "rotation"]) {
      violations = [];
      const args = makeResourceArgs({
        type: "aws:iam/role:Role",
        urn: `urn:pulumi:s::p::aws:iam/role:Role::${kind}-role`,
        name: `${kind}-role`,
        props: {
          tags: {
            "hulumi:component": "BrokeredAuroraPostgresBoundary",
            "hulumi:identity-kind": kind,
            "hulumi:iac-role": "true",
          },
        },
      });
      (
        h3AdvisoryIacRoleTag.validateResource as (
          a: ResourceValidationArgs,
          r: (m: string) => void,
        ) => void
      )(args, report);
      expect(violations, kind).toHaveLength(1);
      expect(violations[0]).toMatch(/workload.*must not carry.*iac-role/i);
    }
  });
});

describe("HulumiHardeningPack H4 — Startup-Hardened SecureBucket without logging sibling", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };

  beforeEach(() => {
    violations = [];
  });

  it("reports HULUMI-H4 when a SecureBucket child bucket is tagged tier=startup-hardened but has no BucketLogging sibling", () => {
    const hardenedBucket = makePolicyResource({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucketV2:BucketV2::sb-hard-bucket",
      name: "sb-hard-bucket",
      props: {
        tags: {
          "hulumi:component": "SecureBucket",
          "hulumi:tier": "startup-hardened",
          "hulumi:controls": "CCM:DSP-01",
        },
      },
    });
    const args = makeStackArgs([hardenedBucket]);
    (
      h4StartupHardenedRequiresLogging.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H4/);
  });

  it("does NOT report when a sibling BucketLoggingV2 is present under the same SecureBucket parent", () => {
    const hardenedBucket = makePolicyResource({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucketV2:BucketV2::sb-ok-bucket",
      name: "sb-ok-bucket",
      props: {
        tags: {
          "hulumi:component": "SecureBucket",
          "hulumi:tier": "startup-hardened",
          "hulumi:controls": "CCM:DSP-01",
        },
      },
    });
    const logging = makePolicyResource({
      type: "aws:s3/bucketLoggingV2:BucketLoggingV2",
      urn: "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucketLoggingV2:BucketLoggingV2::sb-ok-logging",
      name: "sb-ok-logging",
      props: { bucket: "sb-ok-bucket", targetBucket: "logs-bucket" },
    });
    const args = makeStackArgs([hardenedBucket, logging]);
    (
      h4StartupHardenedRequiresLogging.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("does NOT report when a non-V2 BucketLogging sibling is present under the same SecureBucket parent", () => {
    const hardenedBucket = makePolicyResource({
      type: "aws:s3/bucket:Bucket",
      urn: "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucket:Bucket::sb-ok-bucket",
      name: "sb-ok-bucket",
      props: {
        tags: {
          "hulumi:component": "SecureBucket",
          "hulumi:tier": "startup-hardened",
          "hulumi:controls": "CCM:DSP-01",
        },
      },
    });
    const logging = makePolicyResource({
      type: "aws:s3/bucketLogging:BucketLogging",
      urn: "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucketLogging:BucketLogging::sb-ok-logging",
      name: "sb-ok-logging",
      props: { bucket: "sb-ok-bucket", targetBucket: "logs-bucket" },
    });
    const args = makeStackArgs([hardenedBucket, logging]);
    (
      h4StartupHardenedRequiresLogging.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });

  it("does NOT report when the SecureBucket is sandbox tier (H4 is startup-hardened-only)", () => {
    const sandboxBucket = makePolicyResource({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucketV2:BucketV2::sb-sandbox-bucket",
      name: "sb-sandbox-bucket",
      props: {
        tags: {
          "hulumi:component": "SecureBucket",
          "hulumi:tier": "sandbox",
          "hulumi:controls": "CCM:DSP-01",
        },
      },
    });
    const args = makeStackArgs([sandboxBucket]);
    (
      h4StartupHardenedRequiresLogging.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(args, report);
    expect(violations).toHaveLength(0);
  });
});

describe("HulumiHardeningPack H5 — SecureBucket H1 exemption must be backed by real hardening", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };
  beforeEach(() => {
    violations = [];
  });

  const PARENT = "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket";
  const exemptedBucket = (): PolicyResource =>
    makePolicyResource({
      type: "aws:s3/bucket:Bucket",
      urn: `${PARENT}$aws:s3/bucket:Bucket::sb-bucket`,
      name: "sb-bucket",
      props: { bucket: "sb-bucket", id: "sb-bucket" },
    });
  // Fixtures explicitly bind each sibling to the exempted bucket via the
  // `bucket` prop and (for the policy) via the `Resource` block. This is
  // what a genuine SecureBucket emits — and is what H5's value-binding
  // check requires to defeat the "decoy siblings targeting a different
  // bucket" bypass.
  const hardenedSiblings = (
    bucket: PolicyResource = exemptedBucket(),
    target = "sb-bucket",
  ): PolicyResource[] => [
    makePolicyResource({
      type: "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock",
      urn: `${PARENT}$aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock::sb-pab`,
      name: "sb-pab",
      props: {
        bucket: target,
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      },
      propertyDependencies: bucketPropertyDependencies(bucket, "bucket"),
    }),
    makePolicyResource({
      type: "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
      urn: `${PARENT}$aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration::sb-sse`,
      name: "sb-sse",
      props: {
        bucket: target,
        rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "aws:kms" } }],
      },
      propertyDependencies: bucketPropertyDependencies(bucket, "bucket"),
    }),
    makePolicyResource({
      type: "aws:s3/bucketOwnershipControls:BucketOwnershipControls",
      urn: `${PARENT}$aws:s3/bucketOwnershipControls:BucketOwnershipControls::sb-own`,
      name: "sb-own",
      props: { bucket: target, rule: { objectOwnership: "BucketOwnerEnforced" } },
      propertyDependencies: bucketPropertyDependencies(bucket, "bucket"),
    }),
    makePolicyResource({
      type: "aws:s3/bucketVersioning:BucketVersioning",
      urn: `${PARENT}$aws:s3/bucketVersioning:BucketVersioning::sb-ver`,
      name: "sb-ver",
      props: { bucket: target, versioningConfiguration: { status: "Enabled" } },
      propertyDependencies: bucketPropertyDependencies(bucket, "bucket"),
    }),
    makePolicyResource({
      type: "aws:s3/bucketPolicy:BucketPolicy",
      urn: `${PARENT}$aws:s3/bucketPolicy:BucketPolicy::sb-pol`,
      name: "sb-pol",
      props: {
        bucket: target,
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Deny",
              Principal: "*",
              Action: "s3:*",
              Resource: [`arn:aws:s3:::${target}`, `arn:aws:s3:::${target}/*`],
              Condition: { Bool: { "aws:SecureTransport": "false" } },
            },
          ],
        }),
      },
      propertyDependencies: bucketPropertyDependencies(bucket, "bucket", "policy"),
    }),
  ];
  const withMutatedTlsStatement = (
    bucket: PolicyResource,
    mutate: (statement: Record<string, unknown>) => void,
  ): PolicyResource[] => {
    const siblings = hardenedSiblings(bucket);
    const policy = siblings[4];
    const props = (policy.props ?? {}) as Record<string, unknown>;
    const document = JSON.parse(String(props.policy)) as {
      Statement: Record<string, unknown>[];
    };
    mutate(document.Statement[0]);
    siblings[4] = {
      ...policy,
      props: { ...props, policy: JSON.stringify(document) },
    };
    return siblings;
  };
  const runH5 = (resources: PolicyResource[], config: Record<string, unknown> = {}): void =>
    (
      h5SecureBucketExemptionRequiresHardening.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs(resources, config), report);

  it("reports HULUMI-H5 for a forged SecureBucket-typed wrapper around a raw bucket with no hardening (the H1 bypass)", () => {
    runH5([exemptedBucket()]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-H5/);
    expect(violations[0]).toMatch(/all-true BucketPublicAccessBlock/);
    expect(violations[0]).toMatch(/SSE-KMS encryption/);
    expect(violations[0]).toMatch(/BucketOwnerEnforced ownership controls/);
    expect(violations[0]).toMatch(/enabled bucket versioning/);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
    expect(violations[0]).toMatch(/forgeable/);
  });

  it("does NOT report when the exempted bucket is backed by all real hardened siblings (genuine SecureBucket)", () => {
    const bucket = exemptedBucket();
    runH5([bucket, ...hardenedSiblings(bucket)]);
    expect(violations).toHaveLength(0);
  });

  it("accepts the canonical TLS deny when s3:* is expressed as a singleton action array", () => {
    const bucket = exemptedBucket();
    const siblings = withMutatedTlsStatement(bucket, (statement) => {
      statement.Action = ["s3:*"];
    });

    runH5([bucket, ...siblings]);

    expect(violations).toHaveLength(0);
  });

  it.each([
    [
      "a specific principal",
      (statement: Record<string, unknown>) => {
        statement.Principal = { AWS: "arn:aws:iam::111122223333:root" };
      },
    ],
    [
      "NotPrincipal",
      (statement: Record<string, unknown>) => {
        statement.NotPrincipal = { AWS: "arn:aws:iam::111122223333:root" };
      },
    ],
    [
      "a specific action",
      (statement: Record<string, unknown>) => {
        statement.Action = "s3:GetObject";
      },
    ],
    [
      "NotAction",
      (statement: Record<string, unknown>) => {
        statement.NotAction = "s3:GetObject";
      },
    ],
    [
      "NotResource",
      (statement: Record<string, unknown>) => {
        statement.NotResource = "arn:aws:s3:::unrelated/*";
      },
    ],
    [
      "an extra condition operator",
      (statement: Record<string, unknown>) => {
        statement.Condition = {
          Bool: { "aws:SecureTransport": "false" },
          StringEquals: { "aws:PrincipalAccount": "111122223333" },
        };
      },
    ],
    [
      "an extra Bool condition",
      (statement: Record<string, unknown>) => {
        statement.Condition = {
          Bool: {
            "aws:SecureTransport": "false",
            "aws:PrincipalIsAWSService": "false",
          },
        };
      },
    ],
    [
      "an unknown statement key",
      (statement: Record<string, unknown>) => {
        statement.UnknownConstraint = "narrower-than-canonical";
      },
    ],
  ])("rejects an apparent TLS deny containing %s", (_label, mutate) => {
    const bucket = exemptedBucket();
    const siblings = withMutatedTlsStatement(bucket, mutate);

    runH5([bucket, ...siblings]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
  });

  it("rejects a TLS deny missing either exact bucket target without copying policy contents", () => {
    const bucket = exemptedBucket();
    const secretMarker = "should-never-appear-in-diagnostics";
    const siblings = withMutatedTlsStatement(bucket, (statement) => {
      statement.Resource = [`arn:aws:s3:::sb-bucket/${secretMarker}`];
    });

    runH5([bucket, ...siblings]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
    expect(violations[0]).not.toContain(secretMarker);
  });

  it("reports only the specific missing control when hardening is partial (SSE present but AES256, not KMS)", () => {
    const bucket = exemptedBucket();
    const siblings = hardenedSiblings(bucket);
    siblings[1] = makePolicyResource({
      type: "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
      urn: `${PARENT}$aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration::sb-sse`,
      name: "sb-sse",
      props: { rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" } }] },
    });
    runH5([bucket, ...siblings]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/SSE-KMS encryption/);
    expect(violations[0]).not.toMatch(/BucketPublicAccessBlock/);
    expect(violations[0]).not.toMatch(/TLS-only/);
  });

  it("rejects controls for another bucket when its physical identity equals the victim logical name", () => {
    const victim = makePolicyResource({
      type: "aws:s3/bucket:Bucket",
      urn: `${PARENT}$aws:s3/bucket:Bucket::victim-bucket`,
      name: "victim-bucket",
      props: { bucket: "victim-physical", id: "victim-physical" },
    });
    const hardenedBucket = makePolicyResource({
      type: "aws:s3/bucket:Bucket",
      urn: `${PARENT}$aws:s3/bucket:Bucket::hardened-bucket`,
      name: "hardened-bucket",
      props: { bucket: "victim-bucket", id: "victim-bucket" },
    });

    runH5([victim, hardenedBucket, ...hardenedSiblings(hardenedBucket, "victim-bucket")]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("victim-bucket");
    expect(violations[0]).toMatch(/all-true BucketPublicAccessBlock/);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
  });

  it.each([
    [0, "all-true BucketPublicAccessBlock"],
    [1, "SSE-KMS encryption"],
    [2, "BucketOwnerEnforced ownership controls"],
    [3, "enabled bucket versioning"],
  ])(
    "rejects control index %i when its bucket property lacks the exact dependency edge",
    (index, label) => {
      const bucket = exemptedBucket();
      const siblings = hardenedSiblings(bucket);
      siblings[index] = { ...siblings[index], propertyDependencies: {} };

      runH5([bucket, ...siblings]);

      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain(label);
    },
  );

  it("rejects a TLS policy whose bucket property is bound but policy document is not", () => {
    const bucket = exemptedBucket();
    const siblings = hardenedSiblings(bucket);
    siblings[4] = {
      ...siblings[4],
      propertyDependencies: bucketPropertyDependencies(bucket, "bucket"),
    };

    runH5([bucket, ...siblings]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
    expect(violations[0]).not.toMatch(/BucketPublicAccessBlock/);
  });

  it("rejects general dependsOn edges when target properties do not depend on the bucket", () => {
    const bucket = exemptedBucket();
    const siblings = hardenedSiblings(bucket).map((sibling) => ({
      ...sibling,
      dependencies: [bucket],
      propertyDependencies: {},
    }));

    runH5([bucket, ...siblings]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/all-true BucketPublicAccessBlock/);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
  });

  it("fails closed when bucket and id expose conflicting physical identities", () => {
    const bucket = makePolicyResource({
      ...exemptedBucket(),
      props: { bucket: "physical-a", id: "physical-b" },
    });

    runH5([bucket, ...hardenedSiblings(bucket, "physical-a")]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/all-true BucketPublicAccessBlock/);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
  });

  it("never falls back to the bucket logical name when physical identity is unresolved", () => {
    const bucket = makePolicyResource({ ...exemptedBucket(), props: {} });

    runH5([bucket, ...hardenedSiblings(bucket, bucket.name)]);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/all-true BucketPublicAccessBlock/);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
  });

  it("honors a HULUMI-H5 suppression scoped to the bucket URN", () => {
    runH5([exemptedBucket()], {
      suppressions: [
        {
          ruleId: "HULUMI-H5",
          reason: "test",
          urnScope: `${PARENT}$aws:s3/bucket:Bucket::sb-bucket`,
          expiresAt: "2999-01-01T00:00:00Z",
        },
      ],
    });
    expect(violations).toHaveLength(0);
  });

  it("does NOT report on a raw bucket with no SecureBucket ancestor (that is H1's job, not H5's)", () => {
    runH5([
      makePolicyResource({
        type: "aws:s3/bucket:Bucket",
        urn: "urn:pulumi:s::p::aws:s3/bucket:Bucket::plain-raw-bucket",
        name: "plain-raw-bucket",
        props: {},
      }),
    ]);
    expect(violations).toHaveLength(0);
  });
});

describe("Suppressions — scope correctly (security, defense in depth)", () => {
  it("matches a suppression scoped to a specific URN and silences that rule only", () => {
    const suppressions = [
      {
        ruleId: "HULUMI-H1",
        reason: "Legacy bucket being migrated under ticket SEC-123",
        urnScope: "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::legacy-bucket",
        expiresAt: "2999-01-01T00:00:00Z",
      },
    ];
    const match = matchSuppression(
      "HULUMI-H1",
      "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::legacy-bucket",
      suppressions,
    );
    expect(match.suppressed).toBe(true);
    expect(match.reason).toMatch(/SEC-123/);

    // Different URN in the same stack — not silenced.
    const otherMatch = matchSuppression(
      "HULUMI-H1",
      "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::other-bucket",
      suppressions,
    );
    expect(otherMatch.suppressed).toBe(false);
  });

  it("respects expiresAt — an expired suppression is not honored", () => {
    const suppressions = [
      {
        ruleId: "HULUMI-H3",
        reason: "Temporary opt-out for legacy role pending SCP rollout",
        urnScope: "urn:pulumi:s::p::aws:iam/role:Role::legacy-role",
        expiresAt: "2020-01-01T00:00:00Z",
      },
    ];
    const match = matchSuppression(
      "HULUMI-H3",
      "urn:pulumi:s::p::aws:iam/role:Role::legacy-role",
      suppressions,
    );
    expect(match.suppressed).toBe(false);
  });

  it("with urnScope ending in `*` matches a URN prefix", () => {
    const suppressions = [
      {
        ruleId: "HULUMI-H3",
        reason: "All legacy-namespace roles are migrating",
        urnScope: "urn:pulumi:s::p::aws:iam/role:Role::legacy-*",
        expiresAt: "2999-01-01T00:00:00Z",
      },
    ];
    const match = matchSuppression(
      "HULUMI-H3",
      "urn:pulumi:s::p::aws:iam/role:Role::legacy-foo",
      suppressions,
    );
    expect(match.suppressed).toBe(true);
  });
});

describe("PackMetadata — shape is stable per interfaces.md §2", () => {
  it("declares the rules with correct IDs and enforcement phasing", () => {
    const ids = hulumiHardeningPackMetadata.rules.map((r) => r.id);
    expect(ids).toEqual([
      "HULUMI-H1",
      "HULUMI-H2",
      "STATE-1",
      "HULUMI-H3",
      "PRIM-1",
      "PRIM-2",
      "PRIM-3",
      "PRIM-4",
      "DETECT-1",
      "DETECT-2",
      "DETECT-3",
      "HULUMI-H4",
      "HULUMI-H5",
    ]);
    const h3 = hulumiHardeningPackMetadata.rules.find((r) => r.id === "HULUMI-H3")!;
    expect(h3.enforcement).toBe("mandatory");
    for (const id of [
      "HULUMI-H1",
      "HULUMI-H2",
      "STATE-1",
      "PRIM-1",
      "PRIM-2",
      "PRIM-3",
      "PRIM-4",
      "DETECT-1",
      "DETECT-2",
      "DETECT-3",
      "HULUMI-H4",
      "HULUMI-H5",
    ]) {
      const r = hulumiHardeningPackMetadata.rules.find((x) => x.id === id)!;
      expect(r.enforcement).toBe("mandatory");
    }
  });

  it("each rule has a docsUrl and a non-empty frameworkIds list", () => {
    for (const rule of hulumiHardeningPackMetadata.rules) {
      expect(rule.docsUrl).toBeTruthy();
      expect(rule.frameworkIds.length).toBeGreaterThan(0);
    }
  });
});

// Cluster B regression — two URN/binding bypasses against H5 that the
// previous implementation missed:
//   1. Decoy siblings parented under the same forged SecureBucket wrapper
//      that satisfy shape checks but reference a DIFFERENT bucket via
//      their `bucket` prop / the policy's `Resource` block.
//   2. Sibling resources whose URNs share the `bucket.urn.split("$")[0]`
//      string prefix but whose actual parent component type is different
//      (the old `startsWith(parentPrefix)` check is fooled by any URN
//      sharing the project + outer-type-prefix segment).
describe("HulumiHardeningPack H5 — URN/binding bypasses (Cluster B regression)", () => {
  let violations: string[];
  const report = (msg: string): void => {
    violations.push(msg);
  };
  beforeEach(() => {
    violations = [];
  });

  const PARENT = "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket";
  const exemptedBucket = (): PolicyResource =>
    makePolicyResource({
      type: "aws:s3/bucket:Bucket",
      urn: `${PARENT}$aws:s3/bucket:Bucket::sb-bucket`,
      name: "sb-bucket",
      props: { bucket: "sb-bucket", id: "sb-bucket" },
    });

  // Decoy siblings: same parent component URN prefix and correct shape,
  // but every `bucket` prop / Resource ARN points at "other-bucket".
  const decoySiblings = (): PolicyResource[] => [
    makePolicyResource({
      type: "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock",
      urn: `${PARENT}$aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock::decoy-pab`,
      name: "decoy-pab",
      props: {
        bucket: "other-bucket",
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      },
    }),
    makePolicyResource({
      type: "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
      urn: `${PARENT}$aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration::decoy-sse`,
      name: "decoy-sse",
      props: {
        bucket: "other-bucket",
        rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "aws:kms" } }],
      },
    }),
    makePolicyResource({
      type: "aws:s3/bucketOwnershipControls:BucketOwnershipControls",
      urn: `${PARENT}$aws:s3/bucketOwnershipControls:BucketOwnershipControls::decoy-own`,
      name: "decoy-own",
      props: { bucket: "other-bucket", rule: { objectOwnership: "BucketOwnerEnforced" } },
    }),
    makePolicyResource({
      type: "aws:s3/bucketVersioning:BucketVersioning",
      urn: `${PARENT}$aws:s3/bucketVersioning:BucketVersioning::decoy-ver`,
      name: "decoy-ver",
      props: { bucket: "other-bucket", versioningConfiguration: { status: "Enabled" } },
    }),
    makePolicyResource({
      type: "aws:s3/bucketPolicy:BucketPolicy",
      urn: `${PARENT}$aws:s3/bucketPolicy:BucketPolicy::decoy-pol`,
      name: "decoy-pol",
      props: {
        bucket: "other-bucket",
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Deny",
              Principal: "*",
              Action: "s3:*",
              Resource: ["arn:aws:s3:::other-bucket", "arn:aws:s3:::other-bucket/*"],
              Condition: { Bool: { "aws:SecureTransport": "false" } },
            },
          ],
        }),
      },
    }),
  ];

  const runH5 = (resources: PolicyResource[]): void =>
    (
      h5SecureBucketExemptionRequiresHardening.validateStack as (
        a: StackValidationArgs,
        r: (m: string) => void,
      ) => void
    )(makeStackArgs(resources), report);

  it("reports HULUMI-H5 when siblings exist but target a DIFFERENT bucket (decoy-sibling bypass)", () => {
    runH5([exemptedBucket(), ...decoySiblings()]);
    expect(violations).toHaveLength(1);
    // Every control is missing because none is bound to the exempted bucket.
    expect(violations[0]).toMatch(/HULUMI-H5/);
    expect(violations[0]).toMatch(/all-true BucketPublicAccessBlock/);
    expect(violations[0]).toMatch(/SSE-KMS encryption/);
    expect(violations[0]).toMatch(/BucketOwnerEnforced ownership controls/);
    expect(violations[0]).toMatch(/enabled bucket versioning/);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
  });

  it("reports HULUMI-H5 when 'siblings' are parented under an UNRELATED component that shares a URN string prefix", () => {
    // Old code used `r.urn.startsWith(bucket.urn.split('$')[0])` which would
    // accept a resource under any component whose URN starts with the same
    // project/stack/outer-type-prefix segment. The anchored helper requires
    // the parent component type chain to match.
    const UNRELATED_PARENT = "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucketImposter";
    const wronglyParented = makePolicyResource({
      type: "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock",
      urn: `${UNRELATED_PARENT}$aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock::wrong-pab`,
      name: "wrong-pab",
      props: {
        bucket: "sb-bucket",
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      },
    });
    runH5([exemptedBucket(), wronglyParented]);
    // PAB is reported missing because the only PAB-shaped resource is not
    // a sibling of the exempted bucket's parent component.
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/all-true BucketPublicAccessBlock/);
  });

  it("reports HULUMI-H5 when the bucket policy's Resource block names a DIFFERENT bucket (decoy policy)", () => {
    // The four non-policy siblings are correctly bound; the policy alone
    // names another bucket in Resource. Only the TLS-only-policy control
    // should be reported as missing.
    const PARENT_LOCAL = PARENT; // alias for clarity
    const bucket = exemptedBucket();
    const siblings: PolicyResource[] = [
      makePolicyResource({
        type: "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock",
        urn: `${PARENT_LOCAL}$aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock::sb-pab`,
        name: "sb-pab",
        props: {
          bucket: "sb-bucket",
          blockPublicAcls: true,
          ignorePublicAcls: true,
          blockPublicPolicy: true,
          restrictPublicBuckets: true,
        },
        propertyDependencies: bucketPropertyDependencies(bucket, "bucket"),
      }),
      makePolicyResource({
        type: "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
        urn: `${PARENT_LOCAL}$aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration::sb-sse`,
        name: "sb-sse",
        props: {
          bucket: "sb-bucket",
          rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "aws:kms" } }],
        },
        propertyDependencies: bucketPropertyDependencies(bucket, "bucket"),
      }),
      makePolicyResource({
        type: "aws:s3/bucketOwnershipControls:BucketOwnershipControls",
        urn: `${PARENT_LOCAL}$aws:s3/bucketOwnershipControls:BucketOwnershipControls::sb-own`,
        name: "sb-own",
        props: { bucket: "sb-bucket", rule: { objectOwnership: "BucketOwnerEnforced" } },
        propertyDependencies: bucketPropertyDependencies(bucket, "bucket"),
      }),
      makePolicyResource({
        type: "aws:s3/bucketVersioning:BucketVersioning",
        urn: `${PARENT_LOCAL}$aws:s3/bucketVersioning:BucketVersioning::sb-ver`,
        name: "sb-ver",
        props: { bucket: "sb-bucket", versioningConfiguration: { status: "Enabled" } },
        propertyDependencies: bucketPropertyDependencies(bucket, "bucket"),
      }),
      makePolicyResource({
        type: "aws:s3/bucketPolicy:BucketPolicy",
        urn: `${PARENT_LOCAL}$aws:s3/bucketPolicy:BucketPolicy::sb-pol`,
        name: "sb-pol",
        props: {
          bucket: "sb-bucket",
          policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Deny",
                Principal: "*",
                Action: "s3:*",
                // Decoy: Resource names a different bucket.
                Resource: ["arn:aws:s3:::other-bucket", "arn:aws:s3:::other-bucket/*"],
                Condition: { Bool: { "aws:SecureTransport": "false" } },
              },
            ],
          }),
        },
        propertyDependencies: bucketPropertyDependencies(bucket, "bucket", "policy"),
      }),
    ];
    runH5([bucket, ...siblings]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/TLS-only bucket policy/);
    expect(violations[0]).not.toMatch(/all-true BucketPublicAccessBlock/);
  });
});
