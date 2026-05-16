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
      props: {},
    });
  const hardenedSiblings = (): PolicyResource[] => [
    makePolicyResource({
      type: "aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock",
      urn: `${PARENT}$aws:s3/bucketPublicAccessBlock:BucketPublicAccessBlock::sb-pab`,
      name: "sb-pab",
      props: {
        blockPublicAcls: true,
        ignorePublicAcls: true,
        blockPublicPolicy: true,
        restrictPublicBuckets: true,
      },
    }),
    makePolicyResource({
      type: "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
      urn: `${PARENT}$aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration::sb-sse`,
      name: "sb-sse",
      props: {
        rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "aws:kms" } }],
      },
    }),
    makePolicyResource({
      type: "aws:s3/bucketOwnershipControls:BucketOwnershipControls",
      urn: `${PARENT}$aws:s3/bucketOwnershipControls:BucketOwnershipControls::sb-own`,
      name: "sb-own",
      props: { rule: { objectOwnership: "BucketOwnerEnforced" } },
    }),
    makePolicyResource({
      type: "aws:s3/bucketVersioning:BucketVersioning",
      urn: `${PARENT}$aws:s3/bucketVersioning:BucketVersioning::sb-ver`,
      name: "sb-ver",
      props: { versioningConfiguration: { status: "Enabled" } },
    }),
    makePolicyResource({
      type: "aws:s3/bucketPolicy:BucketPolicy",
      urn: `${PARENT}$aws:s3/bucketPolicy:BucketPolicy::sb-pol`,
      name: "sb-pol",
      props: {
        policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Deny",
              Principal: "*",
              Action: "s3:*",
              Condition: { Bool: { "aws:SecureTransport": "false" } },
            },
          ],
        }),
      },
    }),
  ];
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
    runH5([exemptedBucket(), ...hardenedSiblings()]);
    expect(violations).toHaveLength(0);
  });

  it("reports only the specific missing control when hardening is partial (SSE present but AES256, not KMS)", () => {
    const siblings = hardenedSiblings();
    siblings[1] = makePolicyResource({
      type: "aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration",
      urn: `${PARENT}$aws:s3/bucketServerSideEncryptionConfiguration:BucketServerSideEncryptionConfiguration::sb-sse`,
      name: "sb-sse",
      props: { rules: [{ applyServerSideEncryptionByDefault: { sseAlgorithm: "AES256" } }] },
    });
    runH5([exemptedBucket(), ...siblings]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/SSE-KMS encryption/);
    expect(violations[0]).not.toMatch(/BucketPublicAccessBlock/);
    expect(violations[0]).not.toMatch(/TLS-only/);
  });

  it("honors a HULUMI-H5 suppression scoped to the bucket URN", () => {
    runH5([exemptedBucket()], {
      suppressions: [
        { ruleId: "HULUMI-H5", reason: "test", urn: `${PARENT}$aws:s3/bucket:Bucket::sb-bucket` },
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
        expiresAt: "2020-01-01T00:00:00Z",
      },
    ];
    const match = matchSuppression("HULUMI-H3", "any-urn", suppressions);
    expect(match.suppressed).toBe(false);
  });

  it("with urnScope ending in `*` matches a URN prefix", () => {
    const suppressions = [
      {
        ruleId: "HULUMI-H3",
        reason: "All legacy-namespace roles are migrating",
        urnScope: "urn:pulumi:s::p::aws:iam/role:Role::legacy-*",
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
  it("declares the five rules with correct IDs and enforcement phasing", () => {
    const ids = hulumiHardeningPackMetadata.rules.map((r) => r.id);
    expect(ids).toEqual(["HULUMI-H1", "HULUMI-H2", "HULUMI-H3", "HULUMI-H4", "HULUMI-H5"]);
    const h3 = hulumiHardeningPackMetadata.rules.find((r) => r.id === "HULUMI-H3")!;
    expect(h3.enforcement).toBe("mandatory");
    for (const id of ["HULUMI-H1", "HULUMI-H2", "HULUMI-H4", "HULUMI-H5"]) {
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
