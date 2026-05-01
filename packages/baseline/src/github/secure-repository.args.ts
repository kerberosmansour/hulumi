import type * as pulumi from "@pulumi/pulumi";
import type * as github from "@pulumi/github";
import type { Tier } from "../aws/tier";

// `Tier` is shared with AWS — imported, not duplicated. The Sandbox /
// Startup-Hardened semantics carry over: Startup-Hardened MUST emit strictly
// more controls than Sandbox (M3's H4 invariant). The `hulumi:controls` tag
// is deliberately omitted in M1 and added in M3 as a staged-migration.

/** Discriminated-union shape: the public branch requires explicit opt-in. */
export type SecureRepositoryArgs = SecureRepositoryArgsPrivate | SecureRepositoryArgsPublic;

/**
 * Pull-request rule applied to the default-branch ruleset. Mirrors the
 * provider's `RepositoryRulesetRulesPullRequest` shape but uses native TS
 * unions so the `Hulumi` API stays decoupled from `@pulumi/github` minor
 * shape churn. Pass `false` to explicitly disable the tier default.
 */
export interface SecureRepositoryPullRequestRule {
  /** GitHub default 0; Hulumi startup-hardened default 1. */
  requiredApprovingReviewCount?: number;
  /** Hulumi startup-hardened default true. */
  dismissStaleReviewsOnPush?: boolean;
  /** Hulumi default false at every tier — opt-in (CODEOWNERS coverage is project-specific). */
  requireCodeOwnerReview?: boolean;
  /** Hulumi startup-hardened default true. */
  requireLastPushApproval?: boolean;
  /** Hulumi startup-hardened default true. */
  requiredReviewThreadResolution?: boolean;
  /** Provider order is preserved. SecureRepository's repo args already pin squash-only merges. */
  allowedMergeMethods?: ReadonlyArray<"merge" | "squash" | "rebase">;
}

/**
 * Required-status-checks rule applied to the default-branch ruleset.
 * Hulumi does not infer status-check contexts — the names are
 * project-specific, so this is opt-in at every tier even though
 * startup-hardened deployments should always declare it.
 */
export interface SecureRepositoryRequiredStatusChecks {
  requiredChecks: ReadonlyArray<{
    /** Status check context name (e.g., "test + typecheck + lint"). */
    context: string;
    /** Optional GitHub App ID that must originate the check. */
    integrationId?: number;
  }>;
  /** Require commits be tested with the latest target-branch code before merge. */
  strictRequiredStatusChecksPolicy?: boolean;
  /** Allow ref creation when a check would otherwise prohibit it. */
  doNotEnforceOnCreate?: boolean;
}

/**
 * Bypass-actor entry. Mirrors `RepositoryRulesetBypassActor`. Empty by
 * default at every tier — explicit-only access avoids the typical
 * "OrganizationAdmin can bypass everything" footgun.
 */
export interface SecureRepositoryBypassActor {
  actorId?: number;
  actorType: "RepositoryRole" | "Team" | "Integration" | "OrganizationAdmin" | "DeployKey";
  bypassMode: "always" | "pullRequest" | "exempt";
}

interface SecureRepositoryArgsCommon {
  tier: Tier;
  /** Optional override of the GitHub provider used for this resource. */
  provider?: github.Provider;
  /** Per-doc default `main`. */
  defaultBranch?: pulumi.Input<string>;
  /** Free-form description; the tag triple is appended automatically. */
  description?: pulumi.Input<string>;
  /** Repository topics (search labels). */
  topics?: pulumi.Input<pulumi.Input<string>[]>;
  /** Default true at all tiers. */
  vulnerabilityAlerts?: boolean;
  /**
   * Default true at startup-hardened, opt-in at sandbox.
   * `Tier` semantics — see `assertValidTier`.
   */
  secretScanning?: boolean;
  /** Default true at startup-hardened. */
  pushProtection?: boolean;
  /**
   * Pull-request rule on the default branch. At sandbox, undefined ⇒ no
   * rule. At startup-hardened, undefined ⇒ a sensible PR rule (1 approval,
   * dismiss-stale-on-push, require-last-push-approval, require thread
   * resolution). Pass `false` to explicitly disable the startup-hardened
   * default.
   */
  pullRequestRule?: SecureRepositoryPullRequestRule | false;
  /**
   * Required-status-checks rule on the default branch. Opt-in at every
   * tier — Hulumi cannot infer project-specific check context names.
   * Pass `false` for symmetry / future-proofing.
   */
  requiredStatusChecks?: SecureRepositoryRequiredStatusChecks | false;
  /**
   * Require linear history (no merge commits). Sandbox default false;
   * startup-hardened default true. Note: SecureRepository's repo args
   * already disable merge-commit creation; this is the ruleset belt to
   * the repo-args braces.
   */
  requireLinearHistory?: boolean;
  /**
   * Bypass actors permitted to override the default-branch ruleset.
   * Empty at every tier — explicit-only access. Listed actors are passed
   * through to the provider unchanged.
   */
  bypassActors?: ReadonlyArray<SecureRepositoryBypassActor>;
}

export interface SecureRepositoryArgsPrivate extends SecureRepositoryArgsCommon {
  /**
   * `private` and `internal` are the safe defaults. `internal` is only
   * available on enterprise plans; the runtime forwards it to the provider
   * unchanged.
   */
  visibility: "private" | "internal";
  /** Discriminator — must be absent or false on the private branch. */
  acknowledgePublic?: false;
}

export interface SecureRepositoryArgsPublic extends SecureRepositoryArgsCommon {
  /** Public visibility — only reachable through the full opt-in below. */
  visibility: "public";
  /** MUST be `true` literal — checked at runtime even if cast through `as any`. */
  acknowledgePublic: true;
  /**
   * MUST be a non-empty (non-whitespace) reason. Captured in the
   * `hulumi:public-justification` tag and the audit-event log so reviewers
   * downstream can trace the decision.
   */
  publicJustification: string;
}
