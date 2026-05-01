import * as pulumi from "@pulumi/pulumi";
import type * as github from "@pulumi/github";

import { assertValidTier } from "../aws/tier";
import { cisGithub } from "../mappings/cis-github";
import { nistSsdfV11 } from "../mappings/nist-ssdf-v1.1";
import { createOrganizationRuleset } from "./org-rulesets";
import { createActionsOrganizationPermissions } from "./org-actions";
import { createActionsOrganizationOidcSubjectClaimCustomizationTemplate } from "./org-oidc-template";
import { applySecurityDefaults } from "./org-security-defaults";

import type { OrgFoundationArgs, OrganizationSecurityBackend } from "./org-foundation.args";
import type { OrgFoundationOutputs, SecurityDefaultsOutput } from "./org-foundation.outputs";

export const ORG_FOUNDATION_COMPONENT_TYPE = "hulumi:baseline:github:OrgFoundation";

/**
 * `hulumi:controls` value — union of cisGithub + nistSsdfV11 IDs across
 * the OrgFoundation surface. Added in M3 (2026-04-26) as the
 * staged-migration completion. Sourced from mapping tables to avoid
 * hand-edited IDs (so the M3 citation-ID validation meta-test can
 * cross-check).
 */
const CONTROLS_CLAIMED_BY_ORG_FOUNDATION: readonly string[] = [
  ...new Set<string>([
    ...cisGithub.orgFoundation,
    ...cisGithub.orgRulesets,
    ...cisGithub.orgActions,
    ...cisGithub.orgOidcTemplate,
    ...cisGithub.orgSecurityDefaults,
    ...nistSsdfV11.orgFoundation,
    ...nistSsdfV11.orgRulesets,
    ...nistSsdfV11.orgActions,
    ...nistSsdfV11.orgOidcTemplate,
    ...nistSsdfV11.orgSecurityDefaults,
  ]),
];

/**
 * `OrgFoundation` mirrors the AWS-side `AccountFoundation` composition:
 * one ComponentResource that owns four sub-resources tied to the GitHub
 * org-level surface (ruleset + Actions allowlist + OIDC sub-claim template
 * + security-defaults backend). The fifth surface — Code Security
 * Configurations attach via REST — is the switchable backend selected
 * via `args.organizationSecurityBackend`.
 *
 * M2 deliberately omits the `hulumi:controls` tag from outputs — M3 adds
 * it as the staged-migration completion (see lessons file).
 */
export class OrgFoundation extends pulumi.ComponentResource implements OrgFoundationOutputs {
  public readonly organizationRulesetId: pulumi.Output<string>;
  public readonly actionsPermissionsId: pulumi.Output<string>;
  public readonly oidcTemplateId: pulumi.Output<string>;
  public readonly securityDefaults: pulumi.Output<SecurityDefaultsOutput>;
  public readonly hulumiControls: pulumi.Output<readonly string[]>;

  constructor(name: string, args: OrgFoundationArgs, opts?: pulumi.ComponentResourceOptions) {
    super(ORG_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    const isStartupHardened = args.tier === "startup-hardened";
    const backend: OrganizationSecurityBackend = args.organizationSecurityBackend ?? "flat-fields";

    // Resolve the default repository permission tier-gated when not
    // explicitly supplied. Sandbox is "none"; startup-hardened is "read".
    const defaultRepositoryPermission =
      args.defaultRepositoryPermission ?? (isStartupHardened ? "read" : "none");

    // Build sub-component create-args with conditional spreads so
    // exactOptionalPropertyTypes doesn't reject undefined assignments.
    const ruleset = createOrganizationRuleset(this, {
      name,
      tier: args.tier,
      ...(args.provider ? { provider: args.provider as github.Provider } : {}),
    });

    const actionsPerms = createActionsOrganizationPermissions(this, {
      name,
      tier: args.tier,
      ...(args.actionsAllowlist ? { allowlist: args.actionsAllowlist } : {}),
      ...(args.provider ? { provider: args.provider as github.Provider } : {}),
    });

    const oidcTemplate = createActionsOrganizationOidcSubjectClaimCustomizationTemplate(this, {
      name,
      ...(args.oidcSubTemplate ? { config: args.oidcSubTemplate } : {}),
      ...(args.provider ? { provider: args.provider as github.Provider } : {}),
    });

    const securityDefaultsResult = applySecurityDefaults({
      parent: this,
      name,
      tier: args.tier,
      organization: args.organization,
      billingEmail: args.billingEmail,
      backend,
      ...(args.securityDefaults ? { defaults: args.securityDefaults } : {}),
      defaultRepositoryPermission,
      ...(args.provider ? { provider: args.provider as github.Provider } : {}),
    });

    this.organizationRulesetId = ruleset.id;
    this.actionsPermissionsId = actionsPerms.id;
    this.oidcTemplateId = oidcTemplate.id;

    // Surface the security-defaults result. Sandbox-tier-with-no-overrides
    // returns undefined from applySecurityDefaults — synthesize an empty
    // backend-opaque output in that case so consumers always get a defined
    // pulumi.Output<SecurityDefaultsOutput>.
    if (securityDefaultsResult !== undefined) {
      this.securityDefaults = pulumi.output(securityDefaultsResult);
    } else {
      const empty: SecurityDefaultsOutput = {
        backend,
        appliedFlags: {} as Record<string, boolean>,
      };
      this.securityDefaults = pulumi.output(empty);
    }

    this.hulumiControls = pulumi.output(CONTROLS_CLAIMED_BY_ORG_FOUNDATION as readonly string[]);

    this.registerOutputs({
      organizationRulesetId: this.organizationRulesetId,
      actionsPermissionsId: this.actionsPermissionsId,
      oidcTemplateId: this.oidcTemplateId,
      securityDefaults: this.securityDefaults,
      hulumiControls: this.hulumiControls,
    });
  }
}
