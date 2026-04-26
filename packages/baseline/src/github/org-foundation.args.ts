import type * as pulumi from "@pulumi/pulumi";
import type * as github from "@pulumi/github";
import type { Tier } from "../aws/tier";

/**
 * Backend choice for the org-level security defaults surface. The two
 * backends produce identical `appliedFlags` outputs — consumers never need
 * to discriminate. The CSC backend is forward-cover for GitHub's marked
 * deprecation of the flat `*_enabled_for_new_repositories` fields on
 * `PATCH /orgs/{org}`.
 */
export type OrganizationSecurityBackend = "flat-fields" | "code-security-configurations";

export interface OrgSecurityDefaults {
  /**
   * Optional toggles for security-and-analysis defaults applied to NEW
   * repositories created in the org. Defaults are tier-gated:
   *   startup-hardened → all true
   *   sandbox          → opt-in (undefined → no change)
   */
  vulnerabilityReporting?: boolean;
  secretScanning?: boolean;
  secretScanningPushProtection?: boolean;
  dependabotAlerts?: boolean;
  dependabotSecurityUpdates?: boolean;
  dependencyGraph?: boolean;
  advancedSecurity?: boolean;
}

export interface ActionsAllowlistConfig {
  allowedActions?: "all" | "local_only" | "selected";
  /**
   * Patterns are validated character-by-character against the GitHub allowlist
   * syntax — no shell metacharacters, no `;`, no path-traversal sequences.
   */
  selectedActionsPatterns?: string[];
  /** Default true at startup-hardened (post-2025-08-15 GitHub roll-out). */
  shaPinningRequired?: boolean;
}

export interface OidcSubTemplateConfig {
  /**
   * When true (default), Hulumi emits the documented three-axis safe shape:
   * `["repo", "context", "job_workflow_ref", "environment"]`. Any custom
   * template runs through `assertOidcTemplateSafe` which rejects `*`, `**`,
   * empty axes, and any axis containing shell metacharacters.
   */
  useDefault: boolean;
  customTemplate?: string[];
}

export interface OrgFoundationArgs {
  tier: Tier;
  /** Org slug (e.g. `kerberosmansour`). Used as the resource owner. */
  organization: pulumi.Input<string>;
  /**
   * Required by GitHub's `OrganizationSettings` resource. Owners API does not
   * default this; Hulumi's `OrgFoundation` exposes it as a required field
   * rather than baking in a placeholder. (Captured as an intentional addition
   * during /slo-execute M2 — see `docs/lessons/hulumi-github-m2.md`.)
   */
  billingEmail: pulumi.Input<string>;
  /** Defaults to `"flat-fields"`. */
  organizationSecurityBackend?: OrganizationSecurityBackend;
  /**
   * Per-flag overrides on the security-defaults surface. Defaults are
   * tier-gated when omitted.
   */
  securityDefaults?: OrgSecurityDefaults;
  actionsAllowlist?: ActionsAllowlistConfig;
  oidcSubTemplate?: OidcSubTemplateConfig;
  /** Default true at startup-hardened. */
  disableClassicPats?: boolean;
  /** Default `"read"` at startup-hardened, `"none"` at sandbox. */
  defaultRepositoryPermission?: "read" | "triage" | "write" | "admin" | "none";
  /** Optional override of the GitHub provider used for this resource. */
  provider?: github.Provider;
}
