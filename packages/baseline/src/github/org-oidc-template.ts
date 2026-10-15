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

const HULUMI_OIDC_REQUIRED_CLAIM_KEYS = ["repo", "job_workflow_ref", "environment"] as const;
const GITHUB_OIDC_CLAIM_KEY = /^[A-Za-z0-9_]+$/;

/**
 * Validate a custom OIDC sub-claim template. Every accepted template:
 *   - binds repository, reusable-workflow, and environment identity
 *   - contains unique GitHub-compatible claim keys
 *   - rejects `*` explicitly with the UNC6426 context carried by the
 *     original security contract
 *
 * The error message names UNC6426 + G_OIDC_1 so the runtime check carries
 * forward the same context that M3's declarative CrossGuard rule will.
 */
export function assertOidcTemplateSafe(template: readonly string[]): void {
  if (!Array.isArray(template) || template.length === 0) {
    throw new Error("OIDC sub-claim template must be a non-empty array of claim keys");
  }

  const seen = new Set<string>();
  for (const axis of template as readonly unknown[]) {
    if (typeof axis !== "string") {
      throw new Error(
        "OIDC sub-claim template contains non-string axis; expected non-empty claim-key strings",
      );
    }
    if (axis.length === 0) {
      throw new Error(
        "OIDC sub-claim template contains empty axis; expected non-empty claim-key strings",
      );
    }
    if (axis.includes("*")) {
      throw new Error(
        `OIDC sub-claim template contains wildcard axis "${axis}"; UNC6426 (March 2026) weaponized this shape; see G_OIDC_1 in M3 for declarative rejection`,
      );
    }
    if (!GITHUB_OIDC_CLAIM_KEY.test(axis)) {
      throw new Error(
        `OIDC sub-claim template axis "${axis}" is an invalid claim key; GitHub permits only alphanumeric characters and underscores`,
      );
    }
    if (seen.has(axis)) {
      throw new Error(`OIDC sub-claim template contains duplicate claim key "${axis}"`);
    }
    seen.add(axis);
  }

  const missing = HULUMI_OIDC_REQUIRED_CLAIM_KEYS.filter((axis) => !seen.has(axis));
  if (missing.length > 0) {
    throw new Error(
      `OIDC sub-claim template is missing required identity axes: ${missing.join(", ")}; custom subjects must bind repository, reusable workflow, and environment`,
    );
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
