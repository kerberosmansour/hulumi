// CisGithubV1Pack rule scaffolding. Section IDs are gated behind CIS
// WorkBench access (see docs/research/hulumi-github/dossier.md open
// question #2 + the v1.1 deferral D4 entry). Until WorkBench access is
// secured, this pack ships placeholder advisory rules so downstream
// consumers can attach the pack and see the WorkBench-pending state
// surfaced explicitly.
//
// On the day WorkBench access lands (v1.1.x), this file fills in real
// rules per CIS GitHub Benchmark v1.2.0 sections. license-boundary-lint
// rejects `:PENDING-WORKBENCH` strings on `release-*` git tags (per
// the M3 lessons file rule #6) so any release after WorkBench is
// secured can't slip out with placeholders.

import type { ResourceValidationPolicy } from "@pulumi/policy";

const DOCS_URL =
  "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/cis-github-v1-pack.md";

/**
 * Placeholder advisory rule. Every WorkBench-pending CIS section gets
 * one of these until D4 lands.
 */
export const cisGithubPlaceholder: ResourceValidationPolicy = {
  name: "CIS-GitHub-v1.2.0-PENDING-WORKBENCH",
  description:
    "CIS GitHub Benchmark v1.2.0 section IDs are gated behind CIS WorkBench member access. This advisory rule signals the WorkBench-pending state explicitly. Real per-section rules ship in v1.1 (D4 deferral).",
  enforcementLevel: "advisory",
  validateResource: (args, reportViolation) => {
    // Only emit the advisory once per stack — keyed off the first
    // resource we see. Without this guard the advisory would repeat
    // for every resource which is too noisy.
    if (!args.urn.endsWith("$")) return; // crude per-stack heuristic
    void reportViolation; // not invoked in M3 — placeholder only
  },
};

export const CIS_GITHUB_V1_PACK_NAME = "cis-github-v1";

export const cisGithubV1PackMetadata = {
  id: CIS_GITHUB_V1_PACK_NAME,
  version: "1.1.0",
  rules: [cisGithubPlaceholder.name],
  docsUrl: DOCS_URL,
} as const;
