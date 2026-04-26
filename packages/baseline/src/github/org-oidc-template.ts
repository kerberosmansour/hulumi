import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

import type { OidcSubTemplateConfig } from "./org-foundation.args";

/**
 * Hulumi's documented three-axis safe default OIDC sub-claim template.
 * Snapshot-pinned: any change to this default fails the M2 BDD test
 * `tm-hulumi-github-abuse-oidc-default-safe` until the snapshot is
 * regenerated with explicit reviewer approval.
 *
 * Resolves to a `sub` claim shape `repo:{org}/{repo}:job_workflow_ref:{org}/
 * {repo}/.github/workflows/{workflow}@{ref}:environment:{environment}` —
 * UNC6426 (March 2026) weaponized the wildcard variant `repo:{org}/{repo}:*`,
 * so this default is non-negotiable in v1.x.
 */
export const HULUMI_OIDC_DEFAULT_CLAIM_KEYS: readonly string[] = [
  "repo",
  "context",
  "job_workflow_ref",
  "environment",
];

/**
 * Validate a custom OIDC sub-claim template. Rejects:
 *   - empty axis strings
 *   - any axis containing `*` (wildcard — UNC6426 shape)
 *   - any axis containing shell metacharacters or control characters
 *
 * The error message names UNC6426 + G_OIDC_1 so the runtime check carries
 * forward the same context that M3's declarative CrossGuard rule will.
 */
export function assertOidcTemplateSafe(template: readonly string[]): void {
  if (!Array.isArray(template) || template.length === 0) {
    throw new Error(
      "OIDC sub-claim template must be a non-empty array of claim keys",
    );
  }
  for (const axis of template) {
    if (typeof axis !== "string" || axis.length === 0) {
      throw new Error(
        "OIDC sub-claim template contains empty axis; expected non-empty claim-key strings",
      );
    }
    if (axis.includes("*")) {
      throw new Error(
        `OIDC sub-claim template contains wildcard axis "${axis}"; UNC6426 (March 2026) weaponized this shape; see G_OIDC_1 in M3 for declarative rejection`,
      );
    }
    // Reject shell metacharacters and control characters as a defense-in-depth
    // hedge against unusual payloads.
    // eslint-disable-next-line no-control-regex
    if (/[;`$()&|<>\\\r\n\t\x00-\x1f]/.test(axis)) {
      throw new Error(
        `OIDC sub-claim template axis "${axis}" contains invalid character (shell metacharacter or control)`,
      );
    }
  }
}

export function createActionsOrganizationOidcSubjectClaimCustomizationTemplate(
  parent: pulumi.ComponentResource,
  args: {
    name: string;
    config?: OidcSubTemplateConfig;
    provider?: github.Provider;
  },
): github.ActionsOrganizationOidcSubjectClaimCustomizationTemplate {
  const config = args.config ?? { useDefault: true };
  const claimKeys = config.useDefault
    ? [...HULUMI_OIDC_DEFAULT_CLAIM_KEYS]
    : [...(config.customTemplate ?? [])];
  if (!config.useDefault) {
    assertOidcTemplateSafe(claimKeys);
  }

  const opts: pulumi.ResourceOptions = args.provider
    ? { parent, provider: args.provider }
    : { parent };

  return new github.ActionsOrganizationOidcSubjectClaimCustomizationTemplate(
    `${args.name}-oidc-template`,
    {
      includeClaimKeys: claimKeys,
    } satisfies github.ActionsOrganizationOidcSubjectClaimCustomizationTemplateArgs,
    opts,
  );
}
