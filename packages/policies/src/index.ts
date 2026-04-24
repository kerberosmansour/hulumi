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

export { cisV5PackMetadata, cisAwsV5_2_1_1_ssePresent } from "./aws/cis-v5-bucket";

export type { PackMetadata, RuleMetadata, Severity, EnforcementLevel } from "./metadata";

export type { Suppression, SuppressionMatch } from "./aws/suppressions";
export { matchSuppression } from "./aws/suppressions";
