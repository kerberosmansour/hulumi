import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

import { assertValidTier, type Tier } from "../aws/tier";
import { cisGithub } from "../mappings/cis-github";
import { nistSsdfV11 } from "../mappings/nist-ssdf-v1.1";
import type {
  SecureRepositoryArgs,
  SecureRepositoryArgsPublic,
  SecureRepositoryPullRequestRule,
  SecureRepositoryRequiredStatusChecks,
} from "./secure-repository.args";
import type { SecureRepositoryOutputs } from "./secure-repository.outputs";

export const SECURE_REPOSITORY_COMPONENT_TYPE = "hulumi:baseline:github:SecureRepository";

/**
 * Controls claimed by SecureRepository — joined into the `hulumi:controls`
 * tag (added in M3 as the staged-migration completion). The set is the
 * union of `cisGithub.secureRepository` and `nistSsdfV11.secureRepository`
 * — sourced from the mapping tables, not hand-edited at this call site,
 * so the M3 citation-ID validation meta-test can cross-check.
 */
const CONTROLS_CLAIMED_BY_SECURE_REPOSITORY: readonly string[] = [
  ...cisGithub.secureRepository,
  ...nistSsdfV11.secureRepository,
];

/**
 * Type guard — true when args take the public-visibility branch with the
 * runtime opt-in markers present. Even if a caller cast through `as any`,
 * the runtime still checks both flags before allowing the public path.
 */
function isPublicBranch(args: SecureRepositoryArgs): args is SecureRepositoryArgsPublic {
  return (args as SecureRepositoryArgsPublic).visibility === "public";
}

/**
 * Build the description string carrying the Hulumi tag triple plus any
 * user-supplied description text. M1 deliberately omits the
 * `hulumi:controls` tag — that lands in M3 as part of the staged-migration
 * (the cis-github.ts + nist-ssdf-v1.1.ts mapping tables ship in M3 too).
 */
function buildDescription(
  tier: Tier,
  userDescription: pulumi.Input<string> | undefined,
  publicJustification: string | undefined,
): pulumi.Output<string> {
  const userPart = pulumi.output(userDescription ?? "");
  return userPart.apply((user: string) => {
    const tags: string[] = [
      "hulumi:component=SecureRepository",
      `hulumi:tier=${tier}`,
      // hulumi:controls added in M3 (2026-04-26) — the staged-migration
      // completion. Joined with `+` to match the AWS-side separator
      // convention (per #36 fix — AWS S3 tag values disallow `,`; GitHub
      // descriptions accept commas but Hulumi uses `+` uniformly so log
      // parsers / mapping cross-checks can use one separator across the
      // entire fleet).
      `hulumi:controls=${CONTROLS_CLAIMED_BY_SECURE_REPOSITORY.join("+")}`,
    ];
    if (publicJustification !== undefined) {
      // The justification value is sanitized to avoid breaking the
      // description's flat-string shape: drop newlines and pipes.
      const safe = publicJustification.replace(/[\n\r|]/g, " ").trim();
      tags.push(`hulumi:public-justification=${safe}`);
    }
    const tagSuffix = tags.join(" ");
    if (user.length === 0) return tagSuffix;
    return `${user} [${tagSuffix}]`;
  });
}

/**
 * Resolve the effective pull-request rule. `false` means caller explicitly
 * disabled the tier default; `undefined` at startup-hardened means apply
 * Hulumi's default-branch PR rule (1 approval, dismiss-stale, last-push,
 * thread-resolution); `undefined` at sandbox means no PR rule.
 *
 * Caller-supplied values always win over tier defaults — a partial object
 * is shallow-merged onto the tier default so callers can override one
 * field without restating the rest.
 */
function resolvePullRequestRule(
  arg: SecureRepositoryPullRequestRule | false | undefined,
  isStartupHardened: boolean,
): github.types.input.RepositoryRulesetRulesPullRequest | undefined {
  if (arg === false) return undefined;
  if (arg === undefined && !isStartupHardened) return undefined;
  const defaults: SecureRepositoryPullRequestRule = isStartupHardened
    ? {
        requiredApprovingReviewCount: 1,
        dismissStaleReviewsOnPush: true,
        requireLastPushApproval: true,
        requiredReviewThreadResolution: true,
      }
    : {};
  const merged: SecureRepositoryPullRequestRule = { ...defaults, ...(arg ?? {}) };
  const out: github.types.input.RepositoryRulesetRulesPullRequest = {};
  if (merged.requiredApprovingReviewCount !== undefined) {
    out.requiredApprovingReviewCount = merged.requiredApprovingReviewCount;
  }
  if (merged.dismissStaleReviewsOnPush !== undefined) {
    out.dismissStaleReviewsOnPush = merged.dismissStaleReviewsOnPush;
  }
  if (merged.requireCodeOwnerReview !== undefined) {
    out.requireCodeOwnerReview = merged.requireCodeOwnerReview;
  }
  if (merged.requireLastPushApproval !== undefined) {
    out.requireLastPushApproval = merged.requireLastPushApproval;
  }
  if (merged.requiredReviewThreadResolution !== undefined) {
    out.requiredReviewThreadResolution = merged.requiredReviewThreadResolution;
  }
  if (merged.allowedMergeMethods !== undefined) {
    out.allowedMergeMethods = [...merged.allowedMergeMethods];
  }
  return out;
}

function buildRequiredStatusChecks(
  rsc: SecureRepositoryRequiredStatusChecks,
): github.types.input.RepositoryRulesetRulesRequiredStatusChecks {
  const out: github.types.input.RepositoryRulesetRulesRequiredStatusChecks = {
    requiredChecks: rsc.requiredChecks.map((c) => {
      const check: github.types.input.RepositoryRulesetRulesRequiredStatusChecksRequiredCheck = {
        context: c.context,
      };
      if (c.integrationId !== undefined) check.integrationId = c.integrationId;
      return check;
    }),
  };
  if (rsc.strictRequiredStatusChecksPolicy !== undefined) {
    out.strictRequiredStatusChecksPolicy = rsc.strictRequiredStatusChecksPolicy;
  }
  if (rsc.doNotEnforceOnCreate !== undefined) {
    out.doNotEnforceOnCreate = rsc.doNotEnforceOnCreate;
  }
  return out;
}

/**
 * Emit a structured audit-event row to stderr. M3's HulumiGithubHardeningPack
 * + license-boundary-lint will eventually scan for these to ensure no token /
 * secret leaks; M1 ships the format and the call sites.
 */
function emitSecurityEvent(event: Record<string, unknown>): void {
  // Stay on `process.stderr.write` so the test mock can capture this without
  // any console.log interleaving. JSON-line shape so structured-log readers
  // can parse without a separate format.
  process.stderr.write(`security_event ${JSON.stringify(event)}\n`);
}

export class SecureRepository extends pulumi.ComponentResource implements SecureRepositoryOutputs {
  public readonly repository: github.Repository;
  public readonly ruleset: github.RepositoryRuleset;
  public readonly repoFullName: pulumi.Output<string>;
  public readonly repoNodeId: pulumi.Output<string>;
  public readonly defaultBranch: pulumi.Output<string>;
  public readonly rulesetId: pulumi.Output<string>;

  constructor(name: string, args: SecureRepositoryArgs, opts?: pulumi.ComponentResourceOptions) {
    super(SECURE_REPOSITORY_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    // Visibility allow-list. The string-literal union gives compile-time
    // protection; the runtime check defends against `as any` casts.
    const v = args.visibility;
    if (v !== "private" && v !== "internal" && v !== "public") {
      throw new Error(
        `Invalid SecureRepository visibility "${String(v)}"; expected one of: private, internal, public`,
      );
    }

    let publicJustification: string | undefined;
    if (isPublicBranch(args)) {
      const ack = (args as SecureRepositoryArgsPublic).acknowledgePublic;
      if (ack !== true) {
        throw new Error(
          "public visibility requires acknowledgePublic: true AND non-empty publicJustification: string",
        );
      }
      const just = (args as SecureRepositoryArgsPublic).publicJustification;
      if (typeof just !== "string" || just.trim().length === 0) {
        throw new Error(
          "public visibility requires acknowledgePublic: true AND non-empty publicJustification: string",
        );
      }
      publicJustification = just;
      emitSecurityEvent({
        event: "public_visibility_acknowledged",
        repoName: name,
        tier: args.tier,
        justification: just,
      });
    }

    const description = buildDescription(args.tier, args.description, publicJustification);

    const parent = { parent: this } as const;
    const providerOpts: pulumi.ResourceOptions = args.provider
      ? { ...parent, provider: args.provider }
      : parent;

    const isStartupHardened = args.tier === "startup-hardened";
    const enableSecretScanning = args.secretScanning ?? isStartupHardened;
    const enablePushProtection = args.pushProtection ?? isStartupHardened;

    // Build repo args; omit optional fields when the caller didn't supply
    // them (the provider's TS types use exactOptionalPropertyTypes-friendly
    // shapes that disallow explicit `undefined`).
    const repoArgs: github.RepositoryArgs = {
      name,
      description,
      visibility: v,
      vulnerabilityAlerts: args.vulnerabilityAlerts ?? true,
      // Allow forking/auto-init/squash/rebase merge: per Hulumi's safe
      // defaults — sandbox tier permits, startup-hardened tier disables
      // forks (M3 enforces declaratively).
      allowAutoMerge: false,
      allowMergeCommit: false,
      allowSquashMerge: true,
      allowRebaseMerge: false,
      deleteBranchOnMerge: true,
      autoInit: true,
    };
    if (args.defaultBranch !== undefined) repoArgs.defaultBranch = args.defaultBranch;
    if (args.topics !== undefined) repoArgs.topics = args.topics;
    // security-and-analysis is gated on visibility — GitHub rejects these
    // settings on public repos that aren't GHAS-licensed. M1 ships the field
    // for private/internal repos; M3 adds the `feature-not-licensed`
    // honest-verdict treatment for the edge cases.
    if (v !== "public") {
      repoArgs.securityAndAnalysis = {
        secretScanning: { status: enableSecretScanning ? "enabled" : "disabled" },
        secretScanningPushProtection: {
          status: enablePushProtection ? "enabled" : "disabled",
        },
      };
    }
    this.repository = new github.Repository(`${name}-repo`, repoArgs, providerOpts);

    // Repository ruleset — Sandbox: deletion + force-push protection; Startup-
    // Hardened adds signed-commits-required + a sensible default PR rule +
    // required-linear-history. The provider's `RepositoryRulesetRules` shape
    // mixes flat booleans (deletion, nonFastForward, requiredSignatures,
    // requiredLinearHistory) with nested objects (pullRequest,
    // requiredStatusChecks).
    const rules: github.types.input.RepositoryRulesetRules = {
      deletion: true,
      nonFastForward: true,
    };
    if (isStartupHardened) {
      rules.requiredSignatures = true;
    }
    const linear = args.requireLinearHistory ?? isStartupHardened;
    if (linear) {
      rules.requiredLinearHistory = true;
    }
    const prRule = resolvePullRequestRule(args.pullRequestRule, isStartupHardened);
    if (prRule !== undefined) {
      rules.pullRequest = prRule;
    }
    const statusChecks = args.requiredStatusChecks;
    if (statusChecks !== false && statusChecks !== undefined) {
      rules.requiredStatusChecks = buildRequiredStatusChecks(statusChecks);
    }

    const rulesetArgs: github.RepositoryRulesetArgs = {
      name: `${name}-ruleset`,
      repository: this.repository.name,
      target: "branch",
      enforcement: "active",
      conditions: {
        refName: {
          includes: ["~DEFAULT_BRANCH"],
          excludes: [],
        },
      },
      rules,
    };
    if (args.bypassActors !== undefined && args.bypassActors.length > 0) {
      rulesetArgs.bypassActors = args.bypassActors.map((a) => {
        const out: github.types.input.RepositoryRulesetBypassActor = {
          actorType: a.actorType,
          bypassMode: a.bypassMode,
        };
        if (a.actorId !== undefined) out.actorId = a.actorId;
        return out;
      });
    }
    this.ruleset = new github.RepositoryRuleset(`${name}-ruleset`, rulesetArgs, providerOpts);

    this.repoFullName = this.repository.fullName;
    this.repoNodeId = this.repository.nodeId;
    this.defaultBranch = this.repository.defaultBranch.apply(
      (b: string | undefined) => b ?? "main",
    );
    this.rulesetId = this.ruleset.id;

    this.registerOutputs({
      repository: this.repository,
      ruleset: this.ruleset,
      repoFullName: this.repoFullName,
      repoNodeId: this.repoNodeId,
      defaultBranch: this.defaultBranch,
      rulesetId: this.rulesetId,
    });
  }
}
