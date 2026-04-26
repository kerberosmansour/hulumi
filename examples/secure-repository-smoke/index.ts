// SecureRepository smoke example — minimal Pulumi program declaring one
// hardened repository against a sandbox GitHub org. Mirrors the AWS-side
// `secure-bucket-smoke` example shape. Documents the v1.1 wedge surface
// and serves as the reference for cookbook readers wiring up Hulumi-for-
// GitHub for the first time.
//
// Provider auth: the default `github` provider picks up `GITHUB_TOKEN` env
// var or a `pulumi config set --secret github:token <value>` config. For
// production, prefer the GitHub App pattern via the `appAuth` block on
// an explicit `github.Provider` instance — see the README for the full
// shape.

import { SecureRepository } from "@hulumi/baseline/github";

// Sandbox-tier repo: deletion + force-push protection only, no required
// signatures.
const sandboxRepo = new SecureRepository("smoke-sandbox", {
  tier: "sandbox",
  visibility: "private",
  description: "Hulumi-for-GitHub v1.1 smoke example — sandbox tier",
});

// Startup-hardened-tier repo: signed-commits required + push protection +
// secret scanning by default.
const hardenedRepo = new SecureRepository("smoke-hardened", {
  tier: "startup-hardened",
  visibility: "private",
  description: "Hulumi-for-GitHub v1.1 smoke example — startup-hardened tier",
});

// Example of the public-visibility opt-in. Uncomment to ship a public
// repo deliberately. Both the acknowledgePublic flag AND a non-empty
// justification are required; the constructor rejects partial opt-in.
//
// const publicRepo = new SecureRepository("smoke-public", {
//   tier: "startup-hardened",
//   visibility: "public",
//   acknowledgePublic: true,
//   publicJustification: "open-source library for the wider community",
// });

export const sandboxFullName = sandboxRepo.repoFullName;
export const hardenedFullName = hardenedRepo.repoFullName;
export const sandboxRulesetId = sandboxRepo.rulesetId;
export const hardenedRulesetId = hardenedRepo.rulesetId;
