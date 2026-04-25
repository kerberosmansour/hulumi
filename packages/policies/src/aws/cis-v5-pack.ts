// CisV5Pack — full sections 1 (IAM), 2 (Storage), 3 (Logging) of the CIS
// AWS Foundations Benchmark v5.0.0. Sections 4 (Monitoring) and 5
// (Networking) ship as advisory stubs — their audited resources either
// aren't Hulumi-created in v1 or require Networking components (v1.1+).
// The rule handlers live in cis-v5-pack.rules.ts; this file is the
// metadata summary + section orchestration. The PolicyPack instance lives
// in src/aws/packs/cis-v5.ts (one PolicyPack per process; M2 lesson).

import type { ResourceValidationPolicy } from "@pulumi/policy";
import type { PackMetadata, RuleMetadata } from "../metadata";

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
  cisV5Section1Iam as section1Iam,
  cisV5Section2Storage as section2Storage,
  cisV5Section3Logging as section3Logging,
  cisV5Section4StubAdvisory as section4Stub,
  cisV5Section5StubAdvisory as section5Stub,
  cisAwsV5_2_1_1_ssePresent as aliasedM2Bucket,
} from "./cis-v5-pack.rules";

const CIS_DOCS = "https://www.cisecurity.org/benchmark/amazon_web_services";

function ruleMeta(
  id: string,
  title: string,
  policy: ResourceValidationPolicy,
  frameworkIds: string[],
): RuleMetadata {
  const lvl = policy.enforcementLevel;
  const enforcement: RuleMetadata["enforcement"] =
    lvl === "mandatory" || lvl === "advisory" || lvl === "disabled" ? lvl : "advisory";
  return {
    id,
    title,
    description: policy.description ?? title,
    severity: enforcement === "mandatory" ? "high" : "medium",
    enforcement,
    frameworkIds,
    docsUrl: CIS_DOCS,
  };
}

export const cisV5PackMetadata: PackMetadata = {
  id: "cis-v5-pack",
  title: "CIS AWS Foundations Benchmark v5.0.0 (sections 1–3 full; 4–5 stub)",
  framework: "CIS-AWS",
  frameworkVersion: "5.0.0",
  severity: "high",
  rules: [
    ruleMeta(
      "CIS-AWS-v5.0.0:1.6",
      "IAM password policy min length",
      cis_1_6_passwordPolicyMinLength,
      ["CIS-AWS-v5.0.0:1.6", "CIS-AWS-v5.0.0:1.8"],
    ),
    ruleMeta(
      "CIS-AWS-v5.0.0:1.9",
      "IAM password policy reuse prevention",
      cis_1_9_passwordReusePrevention,
      ["CIS-AWS-v5.0.0:1.9"],
    ),
    ruleMeta("CIS-AWS-v5.0.0:1.16", "No full-admin IAM policy", cis_1_16_noFullAdminPolicy, [
      "CIS-AWS-v5.0.0:1.16",
    ]),
    ruleMeta(
      "CIS-AWS-v5.0.0:1.19",
      "IAM Access Analyzer presence",
      cis_1_19_accessAnalyzerEnabled,
      ["CIS-AWS-v5.0.0:1.19", "CIS-AWS-v5.0.0:1.20"],
    ),
    ruleMeta("CIS-AWS-v5.0.0:2.1.1", "S3 bucket default SSE", cis_2_1_1_ssePresent, [
      "CIS-AWS-v5.0.0:2.1.1",
    ]),
    ruleMeta("CIS-AWS-v5.0.0:2.1.5", "S3 TLS-only bucket policy", cis_2_1_5_tlsOnly, [
      "CIS-AWS-v5.0.0:2.1.5",
    ]),
    ruleMeta("CIS-AWS-v5.0.0:2.3.1", "RDS encryption at rest", cis_2_3_1_rdsEncryption, [
      "CIS-AWS-v5.0.0:2.3.1",
    ]),
    ruleMeta("CIS-AWS-v5.0.0:3.1", "CloudTrail multi-region", cis_3_1_cloudTrailEnabled, [
      "CIS-AWS-v5.0.0:3.1",
    ]),
    ruleMeta("CIS-AWS-v5.0.0:3.2", "CloudTrail log-file validation", cis_3_2_logFileValidation, [
      "CIS-AWS-v5.0.0:3.2",
    ]),
    ruleMeta(
      "CIS-AWS-v5.0.0:3.7",
      "CloudTrail logs encrypted by KMS CMK",
      cis_3_7_cloudTrailKmsCmk,
      ["CIS-AWS-v5.0.0:3.7"],
    ),
    ruleMeta(
      "CIS-AWS-v5.0.0:3.8",
      "KMS CMK automatic rotation enabled",
      cis_3_8_kmsRotationEnabled,
      ["CIS-AWS-v5.0.0:3.8"],
    ),
    ruleMeta(
      "HULUMI-CIS-v5-NOT-IMPLEMENTED-v1-section-4",
      "CIS §4 monitoring stub (not implemented in v1)",
      section4Stub,
      ["CIS-AWS-v5.0.0:4.x"],
    ),
    ruleMeta(
      "HULUMI-CIS-v5-NOT-IMPLEMENTED-v1-section-5",
      "CIS §5 networking stub (not implemented in v1)",
      section5Stub,
      ["CIS-AWS-v5.0.0:5.x"],
    ),
  ],
};

export {
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
} from "./cis-v5-pack.rules";

export const cisV5Section1Iam = section1Iam;
export const cisV5Section2Storage = section2Storage;
export const cisV5Section3Logging = section3Logging;
export const cisV5Section4StubAdvisory = section4Stub;
export const cisV5Section5StubAdvisory = section5Stub;

// Keep the old M2 export name alive for any lingering import; equivalent to
// cis_2_1_1_ssePresent.
export const cisAwsV5_2_1_1_ssePresent = aliasedM2Bucket;
