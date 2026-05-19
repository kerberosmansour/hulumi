// CIS AWS Foundations Benchmark v5.0.0 rule handlers — sections 1 (IAM),
// 2 (Storage), 3 (Logging). Sections 4 (Monitoring) and 5 (Networking)
// ship as single advisory stubs in cis-v5-pack.ts because their audited
// resources either aren't Hulumi-created in v1 or require Networking
// components (planned v1.1+).
//
// IDs only — no verbatim CIS prose. The rule descriptions paraphrase the
// intent; the framework ID + URL is the citation.

import type { ResourceValidationPolicy } from "@pulumi/policy";

import { isUrnChildOfComponent } from "../urn";

const CIS_DOCS = "https://www.cisecurity.org/benchmark/amazon_web_services";
const HULUMI_SECURE_BUCKET_TYPE = "hulumi:baseline:aws:SecureBucket";

const S3_BUCKET_TYPES = ["aws:s3/bucket:Bucket", "aws:s3/bucketV2:BucketV2"] as const;

function violation(id: string, name: string, suffix: string): string {
  return `${id}: ${name} — ${suffix}. Docs: ${CIS_DOCS}`;
}

// =========================================================================
// Section 1 — IAM
// =========================================================================

export const cis_1_6_passwordPolicyMinLength: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-1.6-password-min-length",
  description:
    "CIS §1.6/1.8 — IAM account password policy must enforce a minimum length of at least 14 characters.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:iam/accountPasswordPolicy:AccountPasswordPolicy") return;
    const props = args.props as Record<string, unknown>;
    const min = typeof props.minimumPasswordLength === "number" ? props.minimumPasswordLength : 0;
    if (min < 14) {
      reportViolation(
        violation(
          "CIS-AWS-v5.0.0:1.6",
          args.name,
          `minimumPasswordLength=${min} is below the 14-character minimum`,
        ),
      );
    }
  },
};

export const cis_1_9_passwordReusePrevention: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-1.9-password-reuse-prevention",
  description: "CIS §1.9 — IAM password policy must prevent reuse of the previous 24 passwords.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:iam/accountPasswordPolicy:AccountPasswordPolicy") return;
    const props = args.props as Record<string, unknown>;
    const reuse =
      typeof props.passwordReusePrevention === "number" ? props.passwordReusePrevention : 0;
    if (reuse < 24) {
      reportViolation(
        violation(
          "CIS-AWS-v5.0.0:1.9",
          args.name,
          `passwordReusePrevention=${reuse} is below the recommended 24`,
        ),
      );
    }
  },
};

export const cis_1_16_noFullAdminPolicy: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-1.16-no-full-admin-iam-policy",
  description:
    "CIS §1.16 — IAM policies must not grant `Action: '*'` paired with `Resource: '*'` (de-facto AdministratorAccess clones).",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    const POLICY_DOC_TYPES = new Set([
      "aws:iam/policy:Policy",
      "aws:iam/rolePolicy:RolePolicy",
      "aws:iam/userPolicy:UserPolicy",
      "aws:iam/groupPolicy:GroupPolicy",
    ]);
    const props = args.props as Record<string, unknown>;
    const policyArn = props.policyArn;
    if (
      (args.type === "aws:iam/rolePolicyAttachment:RolePolicyAttachment" ||
        args.type === "aws:iam/userPolicyAttachment:UserPolicyAttachment" ||
        args.type === "aws:iam/groupPolicyAttachment:GroupPolicyAttachment") &&
      policyArn === "arn:aws:iam::aws:policy/AdministratorAccess"
    ) {
      reportViolation(
        violation(
          "CIS-AWS-v5.0.0:1.16",
          args.name,
          "policy attachment uses AWS managed AdministratorAccess policy",
        ),
      );
      return;
    }
    if (!POLICY_DOC_TYPES.has(args.type)) return;
    const policyDoc = props.policy;
    let parsed: unknown;
    try {
      parsed = typeof policyDoc === "string" ? JSON.parse(policyDoc) : policyDoc;
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const stmts = (parsed as Record<string, unknown>).Statement;
    if (!Array.isArray(stmts)) return;
    const hasFullAdmin = stmts.some((s: unknown) => {
      if (!s || typeof s !== "object") return false;
      const stmt = s as Record<string, unknown>;
      const effect = stmt.Effect;
      const action = stmt.Action;
      const resource = stmt.Resource;
      const wildcardAction = action === "*" || (Array.isArray(action) && action.includes("*"));
      const wildcardResource =
        resource === "*" || (Array.isArray(resource) && resource.includes("*"));
      return effect === "Allow" && wildcardAction && wildcardResource;
    });
    if (hasFullAdmin) {
      reportViolation(
        violation(
          "CIS-AWS-v5.0.0:1.16",
          args.name,
          `policy document contains an Allow Statement with Action="*" and Resource="*"`,
        ),
      );
    }
  },
};

export const cis_1_19_accessAnalyzerEnabled: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-1.19-access-analyzer-enabled",
  description:
    "CIS §1.19 — IAM Access Analyzer must be enabled in active regions. This rule advises when an IAM principal exists in a stack but no Access Analyzer resource is present.",
  enforcementLevel: "advisory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:iam/role:Role") return;
    // Per-resource visibility only — the stack-level "is Access Analyzer
    // enabled" assertion lives in the M3 integration test. Here we surface
    // a lightweight advisory pointer to encourage Access Analyzer adoption
    // for any stack that defines IAM roles.
    reportViolation(
      `CIS-AWS-v5.0.0:1.19 advisory: IAM role ${args.name} present in stack — confirm IAM Access Analyzer is enabled in this region (covered by AccountFoundation startup-hardened tier). Docs: ${CIS_DOCS}`,
    );
  },
};

export const cisV5Section1Iam: ResourceValidationPolicy[] = [
  cis_1_6_passwordPolicyMinLength,
  cis_1_9_passwordReusePrevention,
  cis_1_16_noFullAdminPolicy,
  cis_1_19_accessAnalyzerEnabled,
];

// =========================================================================
// Section 2 — Storage
// =========================================================================

export const cis_2_1_1_ssePresent: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-2.1.1-bucket-sse",
  description:
    "CIS §2.1.1 — S3 buckets must have default server-side encryption configured. Advises when a bucket is not parented by SecureBucket (which guarantees SSE-KMS).",
  enforcementLevel: "advisory",
  validateResource: (args, reportViolation) => {
    if (!(S3_BUCKET_TYPES as readonly string[]).includes(args.type)) return;
    // Anchored URN type-chain check — see ../urn.ts. The previous
    // `args.urn.includes("hulumi:baseline:aws:SecureBucket$")` matched the
    // operator-controlled logical-name suffix and let a raw bucket named
    // `hulumi:baseline:aws:SecureBucket$x` silence this advisory.
    if (isUrnChildOfComponent(args.urn, HULUMI_SECURE_BUCKET_TYPE)) return;
    reportViolation(
      violation(
        "CIS-AWS-v5.0.0:2.1.1",
        args.name,
        `raw bucket may lack default SSE; switch to @hulumi/baseline.aws.SecureBucket for guaranteed SSE-KMS`,
      ),
    );
  },
};

export const cis_2_1_5_tlsOnly: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-2.1.5-tls-only-bucket-policy",
  description:
    "CIS §2.1.5 — S3 buckets must enforce a deny-non-TLS bucket policy. Advises when a raw bucket exists with no parent SecureBucket.",
  enforcementLevel: "advisory",
  validateResource: (args, reportViolation) => {
    if (!(S3_BUCKET_TYPES as readonly string[]).includes(args.type)) return;
    // Anchored URN type-chain check — see ../urn.ts. The previous
    // `args.urn.includes("hulumi:baseline:aws:SecureBucket$")` matched the
    // operator-controlled logical-name suffix and let a raw bucket named
    // `hulumi:baseline:aws:SecureBucket$x` silence this advisory.
    if (isUrnChildOfComponent(args.urn, HULUMI_SECURE_BUCKET_TYPE)) return;
    reportViolation(
      violation(
        "CIS-AWS-v5.0.0:2.1.5",
        args.name,
        `raw bucket likely lacks aws:SecureTransport=false deny policy`,
      ),
    );
  },
};

export const cis_2_3_1_rdsEncryption: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-2.3.1-rds-encryption-at-rest",
  description:
    "CIS §2.3.1 — RDS instances must be encrypted at rest. RDS is not yet a Hulumi component (v1.1+); this rule fires on raw RDS instances.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:rds/instance:Instance") return;
    const props = args.props as Record<string, unknown>;
    if (props.storageEncrypted !== true) {
      reportViolation(
        violation(
          "CIS-AWS-v5.0.0:2.3.1",
          args.name,
          `RDS instance has storageEncrypted=${String(props.storageEncrypted)}; must be true`,
        ),
      );
    }
  },
};

export const cisV5Section2Storage: ResourceValidationPolicy[] = [
  cis_2_1_1_ssePresent,
  cis_2_1_5_tlsOnly,
  cis_2_3_1_rdsEncryption,
];

// Keep the M2 export name alive so existing imports compile.
export const cisAwsV5_2_1_1_ssePresent = cis_2_1_1_ssePresent;

// =========================================================================
// Section 3 — Logging
// =========================================================================

export const cis_3_1_cloudTrailEnabled: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-3.1-cloudtrail-multi-region",
  description:
    "CIS §3.1 — CloudTrail must be enabled in all regions. Mandatory: a Trail with isMultiRegionTrail=false fails the rule.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:cloudtrail/trail:Trail") return;
    const props = args.props as Record<string, unknown>;
    if (props.isMultiRegionTrail !== true) {
      reportViolation(
        violation(
          "CIS-AWS-v5.0.0:3.1",
          args.name,
          `Trail has isMultiRegionTrail=${String(props.isMultiRegionTrail)}; must be true`,
        ),
      );
    }
  },
};

export const cis_3_2_logFileValidation: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-3.2-cloudtrail-log-file-validation",
  description: "CIS §3.2 — CloudTrail log file validation must be enabled.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:cloudtrail/trail:Trail") return;
    const props = args.props as Record<string, unknown>;
    if (props.enableLogFileValidation !== true) {
      reportViolation(
        violation(
          "CIS-AWS-v5.0.0:3.2",
          args.name,
          `Trail has enableLogFileValidation=${String(props.enableLogFileValidation)}; must be true`,
        ),
      );
    }
  },
};

export const cis_3_7_cloudTrailKmsCmk: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-3.7-cloudtrail-kms-cmk",
  description:
    "CIS §3.7 — CloudTrail logs must be encrypted at rest using a KMS customer-managed key.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:cloudtrail/trail:Trail") return;
    const props = args.props as Record<string, unknown>;
    const kmsKeyId = props.kmsKeyId;
    if (typeof kmsKeyId !== "string" || kmsKeyId.length === 0) {
      reportViolation(
        violation(
          "CIS-AWS-v5.0.0:3.7",
          args.name,
          `Trail has no kmsKeyId set; logs will use AWS-managed key, not CMK`,
        ),
      );
    }
  },
};

export const cis_3_8_kmsRotationEnabled: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-3.8-kms-rotation-enabled",
  description: "CIS §3.8 — Customer-managed KMS keys must have automatic rotation enabled.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:kms/key:Key") return;
    const props = args.props as Record<string, unknown>;
    if (props.enableKeyRotation !== true) {
      reportViolation(
        violation(
          "CIS-AWS-v5.0.0:3.8",
          args.name,
          `KMS key has enableKeyRotation=${String(props.enableKeyRotation)}; must be true`,
        ),
      );
    }
  },
};

export const cisV5Section3Logging: ResourceValidationPolicy[] = [
  cis_3_1_cloudTrailEnabled,
  cis_3_2_logFileValidation,
  cis_3_7_cloudTrailKmsCmk,
  cis_3_8_kmsRotationEnabled,
];

// =========================================================================
// Sections 4–5 — Stub advisories
// =========================================================================

export const cisV5Section4StubAdvisory: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-section-4-stub-not-implemented",
  description:
    "CIS §4 (Monitoring) — CloudWatch alarms / metric filters audited by CIS v5 are not yet first-class Hulumi components; v1.1+ roadmap. This rule fires advisory on raw CloudWatch alarm resources to surface the gap.",
  enforcementLevel: "advisory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:cloudwatch/metricAlarm:MetricAlarm") return;
    reportViolation(
      `HULUMI-CIS-v5-NOT-IMPLEMENTED-v1: CIS §4 monitoring rules are not implemented in Hulumi v1.0.0. Resource ${args.name} is exempt from this check until v1.1+. Roadmap: ${CIS_DOCS}`,
    );
  },
};

export const cisV5Section5StubAdvisory: ResourceValidationPolicy = {
  name: "CIS-AWS-v5.0.0-section-5-stub-not-implemented",
  description:
    "CIS §5 (Networking) — VPC + security-group rules audited by CIS v5 require a Hulumi Networking component (v1.1+ roadmap). Fires advisory on raw VPC and security-group resources.",
  enforcementLevel: "advisory",
  validateResource: (args, reportViolation) => {
    if (args.type !== "aws:ec2/vpc:Vpc" && args.type !== "aws:ec2/securityGroup:SecurityGroup") {
      return;
    }
    reportViolation(
      `HULUMI-CIS-v5-NOT-IMPLEMENTED-v1: CIS §5 networking rules are not implemented in Hulumi v1.0.0. Resource ${args.name} is exempt from this check until v1.1+. Roadmap: ${CIS_DOCS}`,
    );
  },
};
