import type * as pulumi from "@pulumi/pulumi";
import type { OrganizationSecurityBackend } from "./org-foundation.args";

/**
 * Backend-opaque output shape. Consumers don't branch on backend; the
 * `appliedFlags` key set is identical regardless of `flat-fields` vs
 * `code-security-configurations`.
 */
export interface SecurityDefaultsOutput {
  backend: OrganizationSecurityBackend;
  appliedFlags: Record<string, boolean>;
  /** Populated only on the CSC backend; undefined on flat-fields. */
  configurationId?: string;
}

export interface OrgFoundationOutputs {
  organizationRulesetId: pulumi.Output<string>;
  actionsPermissionsId: pulumi.Output<string>;
  oidcTemplateId: pulumi.Output<string>;
  securityDefaults: pulumi.Output<SecurityDefaultsOutput>;
  /**
   * `hulumi:controls` value — added in M3 (2026-04-26) as the
   * staged-migration completion. Surfaced as an array (not a joined
   * string) so consumers don't depend on a separator convention; the
   * AWS-side tag-value form joins with `+` (per #36 — S3 tag values
   * disallow `,`). Contents are the union of
   * `cisGithub.{orgFoundation,orgRulesets,orgActions,orgOidcTemplate,orgSecurityDefaults}`
   * and `nistSsdfV11.{...}` from the mapping tables (no hand-edited IDs).
   * Consumers (M5 cookbooks, audit-trail tooling) can read this output to
   * cross-reference the controls a given OrgFoundation claims to address.
   */
  hulumiControls: pulumi.Output<readonly string[]>;
}
