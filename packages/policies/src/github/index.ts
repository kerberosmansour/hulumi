// @hulumi/policies/github — CrossGuard pack module for the
// Hulumi-for-GitHub surface. Added in v1.1.0 M3 (2026-04-26).
//
// One PolicyPack per process per @pulumi/policy contract; see
// packs/hulumi-hardening.ts and packs/cis-v1.ts for the entry points.

export { federatedIsGithubOidc, GITHUB_OIDC_ISSUER_HOST } from "./github-oidc-issuer";

export {
  G_OIDC_1,
  G_OIDC_1_AWS_IAM_ROLE_TYPE,
  G_OIDC_1_AZURE_FEDERATED_CRED_TYPE,
  G_OIDC_1_GCP_WIF_PROVIDER_TYPE,
  subClaimIsUnsafe,
} from "./g-oidc-1";

export {
  G_OIDC_2,
  G_OIDC_2_AWS_IAM_ROLE_TYPE,
  G_OIDC_2_EKS_ACCESS_POLICY_ASSOCIATION_TYPE,
  G_OIDC_2_IAM_ROLE_POLICY_ATTACHMENT_TYPE,
  trustPolicyTrustsGithubOidc,
} from "./g-oidc-2";

export {
  h1NoRawGithubRepository,
  h2NoWildcardOidcTemplate,
  h3NoWildcardTrustPolicy,
  h4NoClusterAdminViaGithubOidc,
  HULUMI_HARDENING_PACK_GITHUB_NAME,
  hulumiHardeningPackGithubMetadata,
} from "./hulumi-hardening-pack.rules";

export {
  cisGithubPlaceholder,
  CIS_GITHUB_V1_PACK_NAME,
  cisGithubV1PackMetadata,
} from "./cis-v1-pack.rules";

export { matchSuppression, type Suppression, type SuppressionMatch } from "./suppressions";
