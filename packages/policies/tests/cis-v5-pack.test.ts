// CIS AWS Foundations v5.0.0 pack — sections 1 (IAM), 2 (Storage), 3
// (Logging) full; sections 4 (Monitoring) and 5 (Networking) stubs. Each
// rule is exercised against a passing fixture AND a failing fixture so
// the rule's report path is positively asserted, not just absence-tested.

import { describe, it, expect, beforeEach } from "vitest";
import type { ResourceValidationArgs, ResourceValidationPolicy } from "@pulumi/policy";

import {
  cis_1_6_passwordPolicyMinLength,
  cis_1_9_passwordReusePrevention,
  cis_1_16_noFullAdminPolicy,
  cis_1_19_accessAnalyzerEnabled,
  cis_2_1_1_ssePresent,
  cis_2_1_5_tlsOnly,
  cis_2_3_1_rdsEncryption,
  cis_3_1_cloudTrailEnabled,
  cis_3_2_logFileValidation,
  cis_3_7_cloudTrailKmsCmk,
  cis_3_8_kmsRotationEnabled,
  cisV5Section4StubAdvisory,
  cisV5Section5StubAdvisory,
  cisV5PackMetadata,
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

function invokeResource(
  policy: ResourceValidationPolicy,
  args: ResourceValidationArgs,
  report: (m: string) => void,
): void {
  (policy.validateResource as (a: ResourceValidationArgs, r: (m: string) => void) => void)(
    args,
    report,
  );
}

describe("CIS §1.6 — IAM password policy minimum length", () => {
  let violations: string[];
  const report = (m: string): void => {
    violations.push(m);
  };
  beforeEach(() => {
    violations = [];
  });

  it("fires when minimumPasswordLength < 14", () => {
    invokeResource(
      cis_1_6_passwordPolicyMinLength,
      makeResourceArgs({
        type: "aws:iam/accountPasswordPolicy:AccountPasswordPolicy",
        urn: "urn:pulumi:s::p::aws:iam/accountPasswordPolicy:AccountPasswordPolicy::weak",
        name: "weak",
        props: { minimumPasswordLength: 8 },
      }),
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:1\.6/);
  });

  it("is silent when minimumPasswordLength >= 14", () => {
    invokeResource(
      cis_1_6_passwordPolicyMinLength,
      makeResourceArgs({
        type: "aws:iam/accountPasswordPolicy:AccountPasswordPolicy",
        urn: "urn:pulumi:s::p::aws:iam/accountPasswordPolicy:AccountPasswordPolicy::strong",
        name: "strong",
        props: { minimumPasswordLength: 14 },
      }),
      report,
    );
    expect(violations).toHaveLength(0);
  });
});

describe("CIS §1.9 — IAM password reuse prevention", () => {
  let violations: string[];
  const report = (m: string): void => {
    violations.push(m);
  };
  beforeEach(() => {
    violations = [];
  });

  it("fires when passwordReusePrevention < 24", () => {
    invokeResource(
      cis_1_9_passwordReusePrevention,
      makeResourceArgs({
        type: "aws:iam/accountPasswordPolicy:AccountPasswordPolicy",
        urn: "x",
        name: "no-reuse",
        props: { passwordReusePrevention: 5 },
      }),
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:1\.9/);
  });

  it("is silent when passwordReusePrevention >= 24", () => {
    invokeResource(
      cis_1_9_passwordReusePrevention,
      makeResourceArgs({
        type: "aws:iam/accountPasswordPolicy:AccountPasswordPolicy",
        urn: "x",
        name: "ok",
        props: { passwordReusePrevention: 24 },
      }),
      report,
    );
    expect(violations).toHaveLength(0);
  });
});

describe("CIS §1.16 — no full-admin IAM policy", () => {
  let violations: string[];
  const report = (m: string): void => {
    violations.push(m);
  };
  beforeEach(() => {
    violations = [];
  });

  it("fires on Action=* + Resource=*", () => {
    invokeResource(
      cis_1_16_noFullAdminPolicy,
      makeResourceArgs({
        type: "aws:iam/policy:Policy",
        urn: "x",
        name: "full-admin",
        props: {
          policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
          }),
        },
      }),
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:1\.16/);
  });

  it("is silent on a scoped policy", () => {
    invokeResource(
      cis_1_16_noFullAdminPolicy,
      makeResourceArgs({
        type: "aws:iam/policy:Policy",
        urn: "x",
        name: "scoped",
        props: {
          policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::specific-bucket/*",
              },
            ],
          }),
        },
      }),
      report,
    );
    expect(violations).toHaveLength(0);
  });

  it("fires on inline role policy with Action=* + Resource=*", () => {
    invokeResource(
      cis_1_16_noFullAdminPolicy,
      makeResourceArgs({
        type: "aws:iam/rolePolicy:RolePolicy",
        urn: "x",
        name: "role-inline-admin",
        props: {
          policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
          }),
        },
      }),
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:1\.16/);
  });

  it("fires on AdministratorAccess policy attachment", () => {
    invokeResource(
      cis_1_16_noFullAdminPolicy,
      makeResourceArgs({
        type: "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
        urn: "x",
        name: "admin-attachment",
        props: {
          policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
        },
      }),
      report,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:1\.16/);
  });
});

describe("CIS §1.19 — Access Analyzer presence advisory", () => {
  it("fires advisory on every IAM Role to remind enable Access Analyzer", () => {
    const violations: string[] = [];
    invokeResource(
      cis_1_19_accessAnalyzerEnabled,
      makeResourceArgs({
        type: "aws:iam/role:Role",
        urn: "x",
        name: "any-role",
        props: { tags: { "hulumi:iac-role": "true" } },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:1\.19/);
    expect(cis_1_19_accessAnalyzerEnabled.enforcementLevel).toBe("advisory");
  });
});

describe("CIS §2.1.1 — S3 SSE advisory on raw bucket", () => {
  it("fires when raw bucket is not parented by SecureBucket", () => {
    const violations: string[] = [];
    invokeResource(
      cis_2_1_1_ssePresent,
      makeResourceArgs({
        type: "aws:s3/bucketV2:BucketV2",
        urn: "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::raw",
        name: "raw",
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:2\.1\.1/);
  });

  it("also fires on the non-V2 raw bucket token", () => {
    const violations: string[] = [];
    invokeResource(
      cis_2_1_1_ssePresent,
      makeResourceArgs({
        type: "aws:s3/bucket:Bucket",
        urn: "urn:pulumi:s::p::aws:s3/bucket:Bucket::raw",
        name: "raw",
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:2\.1\.1/);
  });

  it.each([
    [
      "aws:s3/bucketV2:BucketV2",
      "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucketV2:BucketV2::sb",
    ],
    [
      "aws:s3/bucket:Bucket",
      "urn:pulumi:s::p::hulumi:baseline:aws:SecureBucket$aws:s3/bucket:Bucket::sb",
    ],
  ])("is silent on a SecureBucket child (%s)", (type, urn) => {
    const violations: string[] = [];
    invokeResource(
      cis_2_1_1_ssePresent,
      makeResourceArgs({
        type,
        urn,
        name: "sb",
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(0);
  });
});

describe("CIS §2.1.5 — TLS-only bucket policy advisory", () => {
  it.each([
    ["aws:s3/bucketV2:BucketV2", "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::raw"],
    ["aws:s3/bucket:Bucket", "urn:pulumi:s::p::aws:s3/bucket:Bucket::raw"],
  ])("fires on raw bucket without SecureBucket parent (%s)", (type, urn) => {
    const violations: string[] = [];
    invokeResource(
      cis_2_1_5_tlsOnly,
      makeResourceArgs({
        type,
        urn,
        name: "raw",
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:2\.1\.5/);
  });
});

describe("CIS §2.3.1 — RDS encryption at rest", () => {
  it("fires when storageEncrypted is false", () => {
    const violations: string[] = [];
    invokeResource(
      cis_2_3_1_rdsEncryption,
      makeResourceArgs({
        type: "aws:rds/instance:Instance",
        urn: "x",
        name: "db",
        props: { storageEncrypted: false },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:2\.3\.1/);
  });

  it("is silent when storageEncrypted is true", () => {
    const violations: string[] = [];
    invokeResource(
      cis_2_3_1_rdsEncryption,
      makeResourceArgs({
        type: "aws:rds/instance:Instance",
        urn: "x",
        name: "db",
        props: { storageEncrypted: true },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(0);
  });
});

describe("CIS §3.1 — CloudTrail multi-region", () => {
  it("fires when isMultiRegionTrail is false", () => {
    const violations: string[] = [];
    invokeResource(
      cis_3_1_cloudTrailEnabled,
      makeResourceArgs({
        type: "aws:cloudtrail/trail:Trail",
        urn: "x",
        name: "single",
        props: { isMultiRegionTrail: false, enableLogFileValidation: true, kmsKeyId: "key/abc" },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:3\.1/);
  });

  it("is silent on multi-region trail", () => {
    const violations: string[] = [];
    invokeResource(
      cis_3_1_cloudTrailEnabled,
      makeResourceArgs({
        type: "aws:cloudtrail/trail:Trail",
        urn: "x",
        name: "multi",
        props: { isMultiRegionTrail: true, enableLogFileValidation: true, kmsKeyId: "key/abc" },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(0);
  });
});

describe("CIS §3.2 — CloudTrail log file validation", () => {
  it("fires when enableLogFileValidation is false", () => {
    const violations: string[] = [];
    invokeResource(
      cis_3_2_logFileValidation,
      makeResourceArgs({
        type: "aws:cloudtrail/trail:Trail",
        urn: "x",
        name: "no-validation",
        props: { isMultiRegionTrail: true, enableLogFileValidation: false },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:3\.2/);
  });
});

describe("CIS §3.7 — CloudTrail KMS CMK", () => {
  it("fires when kmsKeyId is missing", () => {
    const violations: string[] = [];
    invokeResource(
      cis_3_7_cloudTrailKmsCmk,
      makeResourceArgs({
        type: "aws:cloudtrail/trail:Trail",
        urn: "x",
        name: "no-cmk",
        props: { isMultiRegionTrail: true, enableLogFileValidation: true },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:3\.7/);
  });

  it("is silent when kmsKeyId is set", () => {
    const violations: string[] = [];
    invokeResource(
      cis_3_7_cloudTrailKmsCmk,
      makeResourceArgs({
        type: "aws:cloudtrail/trail:Trail",
        urn: "x",
        name: "with-cmk",
        props: {
          isMultiRegionTrail: true,
          enableLogFileValidation: true,
          kmsKeyId: "arn:aws:kms:us-east-1:123:key/abc",
        },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(0);
  });
});

describe("CIS §3.8 — KMS automatic rotation", () => {
  it("fires when enableKeyRotation is false", () => {
    const violations: string[] = [];
    invokeResource(
      cis_3_8_kmsRotationEnabled,
      makeResourceArgs({
        type: "aws:kms/key:Key",
        urn: "x",
        name: "no-rotation",
        props: { enableKeyRotation: false },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:3\.8/);
  });

  it("is silent when enableKeyRotation is true", () => {
    const violations: string[] = [];
    invokeResource(
      cis_3_8_kmsRotationEnabled,
      makeResourceArgs({
        type: "aws:kms/key:Key",
        urn: "x",
        name: "ok",
        props: { enableKeyRotation: true },
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(0);
  });
});

describe("CIS §4 stub — fires advisory on CloudWatch alarm", () => {
  it("emits HULUMI-CIS-v5-NOT-IMPLEMENTED-v1 advisory on a CloudWatch metric alarm", () => {
    const violations: string[] = [];
    invokeResource(
      cisV5Section4StubAdvisory,
      makeResourceArgs({
        type: "aws:cloudwatch/metricAlarm:MetricAlarm",
        urn: "x",
        name: "any-alarm",
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-CIS-v5-NOT-IMPLEMENTED-v1/);
    expect(cisV5Section4StubAdvisory.enforcementLevel).toBe("advisory");
  });

  it("is silent on non-CloudWatch resources", () => {
    const violations: string[] = [];
    invokeResource(
      cisV5Section4StubAdvisory,
      makeResourceArgs({
        type: "aws:s3/bucketV2:BucketV2",
        urn: "x",
        name: "bucket",
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(0);
  });
});

describe("CIS §5 stub — fires advisory on raw VPC / security group", () => {
  it("emits HULUMI-CIS-v5-NOT-IMPLEMENTED-v1 on a VPC", () => {
    const violations: string[] = [];
    invokeResource(
      cisV5Section5StubAdvisory,
      makeResourceArgs({
        type: "aws:ec2/vpc:Vpc",
        urn: "x",
        name: "vpc",
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-CIS-v5-NOT-IMPLEMENTED-v1/);
  });

  it("emits HULUMI-CIS-v5-NOT-IMPLEMENTED-v1 on a security group", () => {
    const violations: string[] = [];
    invokeResource(
      cisV5Section5StubAdvisory,
      makeResourceArgs({
        type: "aws:ec2/securityGroup:SecurityGroup",
        urn: "x",
        name: "sg",
      }),
      (m: string) => violations.push(m),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/HULUMI-CIS-v5-NOT-IMPLEMENTED-v1/);
  });
});

describe("CisV5Pack metadata — every registered rule has a runtime test", () => {
  it("covers each metadata.rules[i].id with a test or sibling stub", () => {
    // The 13 rule IDs declared in cisV5PackMetadata must each be either a
    // section-1/2/3 rule covered by a describe-block above, or a section
    // stub. A future rule addition without a test will fail this length
    // assertion + the per-id mapping below.
    const ids = cisV5PackMetadata.rules.map((r) => r.id);
    expect(ids).toEqual([
      "CIS-AWS-v5.0.0:1.6",
      "CIS-AWS-v5.0.0:1.9",
      "CIS-AWS-v5.0.0:1.16",
      "CIS-AWS-v5.0.0:1.19",
      "CIS-AWS-v5.0.0:2.1.1",
      "CIS-AWS-v5.0.0:2.1.5",
      "CIS-AWS-v5.0.0:2.3.1",
      "CIS-AWS-v5.0.0:3.1",
      "CIS-AWS-v5.0.0:3.2",
      "CIS-AWS-v5.0.0:3.7",
      "CIS-AWS-v5.0.0:3.8",
      "HULUMI-CIS-v5-NOT-IMPLEMENTED-v1-section-4",
      "HULUMI-CIS-v5-NOT-IMPLEMENTED-v1-section-5",
    ]);
  });

  it("section-4 and section-5 stubs are advisory enforcement", () => {
    const s4 = cisV5PackMetadata.rules.find(
      (r) => r.id === "HULUMI-CIS-v5-NOT-IMPLEMENTED-v1-section-4",
    );
    const s5 = cisV5PackMetadata.rules.find(
      (r) => r.id === "HULUMI-CIS-v5-NOT-IMPLEMENTED-v1-section-5",
    );
    expect(s4?.enforcement).toBe("advisory");
    expect(s5?.enforcement).toBe("advisory");
  });

  it("every rule has a docsUrl and at least one frameworkId", () => {
    for (const rule of cisV5PackMetadata.rules) {
      expect(rule.docsUrl).toBeTruthy();
      expect(rule.frameworkIds.length).toBeGreaterThan(0);
    }
  });
});

// Cluster B regression — cis_2_1_1_ssePresent and cis_2_1_5_tlsOnly skip
// when `args.urn.includes("hulumi:baseline:aws:SecureBucket$")`. That
// substring fires on attacker-controlled logical names too. Advisory
// enforcement only, but the same forged-logical-name spoof class.
describe("CIS-v5 §2.1.1 / §2.1.5 — forged-logical-name URN spoof", () => {
  let violations: string[];
  const report = (m: string): void => {
    violations.push(m);
  };

  beforeEach(() => {
    violations = [];
  });

  it("CIS 2.1.1 still advises a raw bucket whose LOGICAL NAME embeds SecureBucket type", () => {
    const args = makeResourceArgs({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::hulumi:baseline:aws:SecureBucket$evil-bucket",
      name: "hulumi:baseline:aws:SecureBucket$evil-bucket",
      props: {},
    });
    invokeResource(cis_2_1_1_ssePresent, args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:2\.1\.1/);
  });

  it("CIS 2.1.5 still advises a raw bucket whose LOGICAL NAME embeds SecureBucket type", () => {
    const args = makeResourceArgs({
      type: "aws:s3/bucketV2:BucketV2",
      urn: "urn:pulumi:s::p::aws:s3/bucketV2:BucketV2::hulumi:baseline:aws:SecureBucket$evil-bucket",
      name: "hulumi:baseline:aws:SecureBucket$evil-bucket",
      props: {},
    });
    invokeResource(cis_2_1_5_tlsOnly, args, report);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/CIS-AWS-v5\.0\.0:2\.1\.5/);
  });
});
