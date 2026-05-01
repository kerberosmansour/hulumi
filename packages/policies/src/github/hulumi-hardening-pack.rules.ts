// HulumiGithubHardeningPack rule handlers — H1, H2, and H3 (= G_OIDC_1).
// H4 tier-monotonicity is an AST-level meta-test that lives alongside
// the source tree (deferred to a follow-up — see lessons file). The
// PolicyPack instance lives in src/github/packs/hulumi-hardening.ts
// (one PolicyPack per process per @pulumi/policy contract).

import type { ResourceValidationPolicy } from "@pulumi/policy";

import { matchSuppression, type Suppression } from "./suppressions";
import { G_OIDC_1 } from "./g-oidc-1";

const HULUMI_SECURE_REPOSITORY_TYPE = "hulumi:baseline:github:SecureRepository";
const HULUMI_ORG_FOUNDATION_TYPE = "hulumi:baseline:github:OrgFoundation";
const RAW_GITHUB_REPO_TYPE = "github:index/repository:Repository";

const DOCS_BASE =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/secure-repository.md";
const H2_DOCS =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/org-foundation.md";

function readSuppressions(config: Record<string, unknown> | undefined): Suppression[] {
  const raw = config?.suppressions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Suppression => {
    if (x === null || typeof x !== "object") return false;
    const o = x as Record<string, unknown>;
    return typeof o.ruleId === "string" && typeof o.reason === "string";
  });
}

function isChildOfSecureRepository(urn: string): boolean {
  return urn.includes(`${HULUMI_SECURE_REPOSITORY_TYPE}$`);
}

function isChildOfOrgFoundation(urn: string): boolean {
  return urn.includes(`${HULUMI_ORG_FOUNDATION_TYPE}$`);
}

/**
 * H1 — raw `github.Repository` outside of `SecureRepository` is rejected.
 * Defends against missing hardened defaults (security-and-analysis
 * settings, push-protection, ruleset wiring) and against bypassing the
 * `acknowledgePublic` opt-in for public visibility.
 */
export const h1NoRawGithubRepository: ResourceValidationPolicy = {
  name: "HULUMI-H1-no-raw-github-repository",
  description:
    "Raw github.Repository is disallowed outside of @hulumi/baseline.github.SecureRepository. Use SecureRepository to inherit hardened defaults (security-and-analysis, ruleset wiring, acknowledgePublic opt-in for public visibility).",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== RAW_GITHUB_REPO_TYPE) return;
    if (isChildOfSecureRepository(args.urn)) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-H1", args.urn, suppressions).suppressed) return;
    reportViolation(
      `HULUMI-H1: raw ${args.type} detected at ${args.urn}. Use @hulumi/baseline.github.SecureRepository instead. Docs: ${DOCS_BASE}`,
    );
  },
};

/**
 * H2 — wildcard custom OIDC sub template is rejected.
 *
 * The wildcard rejection happens at runtime in `OrgFoundation`'s
 * constructor (M2's `assertOidcTemplateSafe`). H2 catches the same
 * shape declaratively at preview-time so the discipline holds even
 * when (a) `OrgFoundation` is bypassed via raw
 * `ActionsOrganizationOidcSubjectClaimCustomizationTemplate`, or (b)
 * an attacker submits a malformed Pulumi state file that drops the
 * runtime check.
 */
const OIDC_TEMPLATE_TYPE =
  "github:index/actionsOrganizationOidcSubjectClaimCustomizationTemplate:ActionsOrganizationOidcSubjectClaimCustomizationTemplate";

export const h2NoWildcardOidcTemplate: ResourceValidationPolicy = {
  name: "HULUMI-H2-no-wildcard-oidc-template",
  description:
    "ActionsOrganizationOidcSubjectClaimCustomizationTemplate must not include `*`, `**`, or empty axes — UNC6426 weaponized exactly this shape. Use the three-axis safe default (`repo`, `context`, `job_workflow_ref`, `environment`).",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== OIDC_TEMPLATE_TYPE) return;
    if (isChildOfOrgFoundation(args.urn)) {
      // OrgFoundation already runtime-rejected wildcards; trust the parent
      // composition. Defense-in-depth check only fires for raw
      // ActionsOrganizationOidcSubjectClaimCustomizationTemplate uses.
      return;
    }
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-H2", args.urn, suppressions).suppressed) return;
    const claimKeys = (args.props as Record<string, unknown>).includeClaimKeys;
    if (!Array.isArray(claimKeys)) return;
    for (const k of claimKeys) {
      if (typeof k !== "string") continue;
      if (k.length === 0 || k.includes("*")) {
        reportViolation(
          `HULUMI-H2: OIDC sub-claim template at ${args.urn} contains an empty or wildcard axis "${k}"; UNC6426 (March 2026) weaponized this shape; use the three-axis safe default. Docs: ${H2_DOCS}`,
        );
        return;
      }
    }
  },
};

/**
 * H3 = G_OIDC_1 — re-exported into the hardening pack as the rule
 * directly. Renamed prefix kept for cookbook/discoverability symmetry
 * with the AWS-side H1/H2/H3/H4 cadence.
 */
export const h3NoWildcardTrustPolicy: ResourceValidationPolicy = {
  ...G_OIDC_1,
  name: "HULUMI-H3-no-wildcard-trust-policy",
};

/**
 * Pack metadata + assembled policy list. Consumed by the entry point at
 * `packs/hulumi-hardening.ts`.
 */
export const HULUMI_HARDENING_PACK_GITHUB_NAME = "hulumi-hardening-github";

export const hulumiHardeningPackGithubMetadata = {
  id: HULUMI_HARDENING_PACK_GITHUB_NAME,
  version: "1.1.0",
  rules: [
    "HULUMI-H1-no-raw-github-repository",
    "HULUMI-H2-no-wildcard-oidc-template",
    "HULUMI-H3-no-wildcard-trust-policy",
  ],
} as const;
