// @hulumi/policies — rule handlers, pack metadata, Suppression helpers.
//
// This file intentionally does NOT export the PolicyPack instances
// (HulumiHardeningPack, CisV5Pack). @pulumi/policy's PolicyPack constructor
// starts a gRPC server at module-load; only one PolicyPack may be served
// per process. Users point their PulumiPolicy.yaml at one of:
//
//   - @hulumi/policies/aws/packs/hulumi-hardening
//   - @hulumi/policies/aws/packs/cis-v5
//
// depending on which pack they want to enforce in a given Pulumi preview.

export {
  hulumiHardeningPackMetadata,
  h1BlocksRawBucket,
  h2BlocksUnencryptedStateBackend,
  h3AdvisoryIacRoleTag,
  h4StartupHardenedRequiresLogging,
  H3_ENFORCEMENT_LEVEL,
  HULUMI_SECURE_BUCKET_TYPE,
  RAW_S3_BUCKET_TYPES,
  IAM_ROLE_TYPE,
} from "./aws/hulumi-hardening-pack";

export {
  cisV5PackMetadata,
  cisAwsV5_2_1_1_ssePresent,
  cisV5Section1Iam,
  cisV5Section2Storage,
  cisV5Section3Logging,
  cisV5Section4StubAdvisory,
  cisV5Section5StubAdvisory,
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
} from "./aws/cis-v5-pack";

export type { PackMetadata, RuleMetadata, Severity, EnforcementLevel } from "./metadata";

export type { Suppression, SuppressionMatch } from "./aws/suppressions";
export { matchSuppression } from "./aws/suppressions";
