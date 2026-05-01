// @hulumi/baseline.github — hardened-by-default GitHub Pulumi components.
// New in Hulumi v1.1.0 M1 (2026-04-26). Mirrors the `aws/index.ts` pattern.

export { SecureRepository, SECURE_REPOSITORY_COMPONENT_TYPE } from "./secure-repository";
export type {
  SecureRepositoryArgs,
  SecureRepositoryArgsPrivate,
  SecureRepositoryArgsPublic,
} from "./secure-repository.args";
export type { SecureRepositoryOutputs } from "./secure-repository.outputs";

// OrgFoundation + sub-component primitives — added in v1.1.0 M2 (2026-04-26).
export { OrgFoundation, ORG_FOUNDATION_COMPONENT_TYPE } from "./org-foundation";
export type {
  OrgFoundationArgs,
  OrganizationSecurityBackend,
  OrgSecurityDefaults,
  ActionsAllowlistConfig,
  OidcSubTemplateConfig,
} from "./org-foundation.args";
export type { OrgFoundationOutputs, SecurityDefaultsOutput } from "./org-foundation.outputs";
// Re-export the Hulumi-default OIDC template so consumers + cookbooks can
// reference the snapshot-pinned default without importing internal paths.
export { HULUMI_OIDC_DEFAULT_CLAIM_KEYS } from "./org-oidc-template";

// `Tier` is shared with AWS — re-exported here so `@hulumi/baseline/github`
// consumers don't need to import from `@hulumi/baseline/aws` for the enum.
// The `Tier` type is identical on both subpaths (same source file).
export { TIERS, isTier, assertValidTier } from "../aws/tier";
export type { Tier } from "../aws/tier";
