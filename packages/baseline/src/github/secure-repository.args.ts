import type * as pulumi from "@pulumi/pulumi";
import type * as github from "@pulumi/github";
import type { Tier } from "../aws/tier";

// `Tier` is shared with AWS — imported, not duplicated. The Sandbox /
// Startup-Hardened semantics carry over: Startup-Hardened MUST emit strictly
// more controls than Sandbox (M3's H4 invariant). The `hulumi:controls` tag
// is deliberately omitted in M1 and added in M3 as a staged-migration.

/** Discriminated-union shape: the public branch requires explicit opt-in. */
export type SecureRepositoryArgs = SecureRepositoryArgsPrivate | SecureRepositoryArgsPublic;

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
