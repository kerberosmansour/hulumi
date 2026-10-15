// HulumiGithubHardeningPack rule handlers — H1, H2, H3 (= G_OIDC_1), and
// H4 (= G_OIDC_2, cluster-admin / AdministratorAccess bound to a
// GitHub-OIDC-trusted role; stack-level). The PolicyPack instance lives
// in src/github/packs/hulumi-hardening.ts (one PolicyPack per process
// per @pulumi/policy contract).

import type { ResourceValidationPolicy, StackValidationPolicy } from "@pulumi/policy";

import { matchSuppression, type Suppression } from "./suppressions";
import { G_OIDC_1 } from "./g-oidc-1";
import { G_OIDC_2 } from "./g-oidc-2";
import { isUrnChildOfComponent } from "../urn";

const HULUMI_SECURE_REPOSITORY_TYPE = "hulumi:baseline:github:SecureRepository";
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
  // Anchored URN type-chain check — see ../urn.ts. The prior
  // `urn.includes(\`${HULUMI_SECURE_REPOSITORY_TYPE}$\`)` was bypassed by a
  // raw github.Repository declared with a logical name carrying the
  // SecureRepository type token.
  return isUrnChildOfComponent(urn, HULUMI_SECURE_REPOSITORY_TYPE);
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
 * H2 — every custom OIDC subject binds repository, reusable-workflow, and
 * environment identity.
 *
 * The wildcard rejection happens at runtime in `OrgFoundation`'s
 * constructor (M2's `assertOidcTemplateSafe`). H2 independently validates
 * every resource at preview-time, including children of a claimed
 * OrgFoundation component, so neither raw resources nor forged component
 * ancestry can bypass the identity contract.
 */
const OIDC_TEMPLATE_TYPE =
  "github:index/actionsOrganizationOidcSubjectClaimCustomizationTemplate:ActionsOrganizationOidcSubjectClaimCustomizationTemplate";
const OIDC_REQUIRED_CLAIM_KEYS = ["repo", "job_workflow_ref", "environment"] as const;
const OIDC_CLAIM_KEY = /^[A-Za-z0-9_]+$/;

function oidcTemplateViolation(claimKeys: unknown): string | undefined {
  if (!Array.isArray(claimKeys) || claimKeys.length === 0) {
    return "includeClaimKeys must be a non-empty array";
  }

  const seen = new Set<string>();
  for (let index = 0; index < claimKeys.length; index += 1) {
    const key = claimKeys[index];
    if (typeof key !== "string") {
      return `includeClaimKeys contains a non-string entry at index ${index}`;
    }
    if (key.length === 0) {
      return `includeClaimKeys contains an empty claim key at index ${index}`;
    }
    if (key.includes("*")) {
      return `includeClaimKeys contains wildcard claim key "${key}"; UNC6426 (March 2026) weaponized this shape`;
    }
    if (!OIDC_CLAIM_KEY.test(key)) {
      return `includeClaimKeys contains invalid claim key "${key}"; GitHub permits only alphanumeric characters and underscores`;
    }
    if (seen.has(key)) {
      return `includeClaimKeys contains duplicate claim key "${key}"`;
    }
    seen.add(key);
  }

  const missing = OIDC_REQUIRED_CLAIM_KEYS.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    return `includeClaimKeys is missing required identity axes: ${missing.join(", ")}`;
  }
  return undefined;
}

export const h2NoWildcardOidcTemplate: ResourceValidationPolicy = {
  name: "HULUMI-H2-no-wildcard-oidc-template",
  description:
    "ActionsOrganizationOidcSubjectClaimCustomizationTemplate must bind `repo`, `job_workflow_ref`, and `environment` through unique GitHub-compatible claim keys. Hulumi's default also includes `context`.",
  enforcementLevel: "mandatory",
  validateResource: (args, reportViolation) => {
    if (args.type !== OIDC_TEMPLATE_TYPE) return;
    const suppressions = readSuppressions(
      (args.getConfig ? args.getConfig() : undefined) as Record<string, unknown> | undefined,
    );
    if (matchSuppression("HULUMI-H2", args.urn, suppressions).suppressed) return;
    const claimKeys = (args.props as Record<string, unknown>).includeClaimKeys;
    const violation = oidcTemplateViolation(claimKeys);
    if (violation === undefined) return;
    reportViolation(
      `HULUMI-H2: OIDC sub-claim template at ${args.urn} is unsafe: ${violation}; require repo, job_workflow_ref, and environment. Docs: ${H2_DOCS}`,
    );
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
 * H4 = G_OIDC_2 — re-exported into the hardening pack as the rule
 * directly (stack-level). Prefix kept for cookbook symmetry with the
 * H1/H2/H3 cadence. Catches the *blast-radius* axis G_OIDC_1 does not:
 * cluster-scoped EKS admin / AWS AdministratorAccess bound to a
 * GitHub-OIDC-trusted IAM role.
 */
export const h4NoClusterAdminViaGithubOidc: StackValidationPolicy = {
  ...G_OIDC_2,
  name: "HULUMI-H4-no-cluster-admin-via-github-oidc",
};

/**
 * Pack metadata + assembled policy list. Consumed by the entry point at
 * `packs/hulumi-hardening.ts`.
 */
export const HULUMI_HARDENING_PACK_GITHUB_NAME = "hulumi-hardening-github";

export const hulumiHardeningPackGithubMetadata = {
  id: HULUMI_HARDENING_PACK_GITHUB_NAME,
  version: "1.2.0",
  rules: [
    "HULUMI-H1-no-raw-github-repository",
    "HULUMI-H2-no-wildcard-oidc-template",
    "HULUMI-H3-no-wildcard-trust-policy",
    "HULUMI-H4-no-cluster-admin-via-github-oidc",
  ],
} as const;
