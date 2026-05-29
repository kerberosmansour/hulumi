#!/usr/bin/env node

// Bounded LLM scope classifier — proposes a track for UNCLASSIFIED manifests,
// strictly within the deterministic gate.
//
// The LLM is advisory; the clamp is authoritative. A proposal that is invalid,
// below the confidence threshold, or names `emergency` falls back to a
// `needsHuman` escalation. The classifier therefore can NEVER grant a manifest
// emergency (auto-merge-to-prod) authority — that remains a human-only edit to
// the scope file. Mirrors src/agents/adapter.ts (schema-validated, stub-backed,
// no merge/secret/push tool).

import { z } from "zod";
import type { DiscoveredManifest } from "../discovery/discover";
import type { DriftReport, PromotionDecision } from "../scope/policy";

// The LLM MAY emit `emergency`; the clamp rejects it. Modeling it in the schema
// keeps the rejection an explicit, tested decision rather than a parse failure.
export const scopeProposalSchema = z
  .object({
    proposedTrack: z.enum(["cadence", "report-only", "ignore", "emergency"]),
    confidence: z.number().min(0).max(1),
    rationale: z.string().min(1),
  })
  .strict();

export type ScopeProposal = z.infer<typeof scopeProposalSchema>;

export interface ScopeClassifierBackend {
  name: string;
  // Bounded context only: path + ecosystem + sibling dir names are SEMI-TRUSTED
  // (committed repo text). No merge/secret/push capability is exposed.
  propose(manifest: DiscoveredManifest): Promise<unknown>;
}

export interface ClassifyOptions {
  confidenceThreshold?: number;
  sampleBudget?: number;
  onWarning?: (message: string) => void;
}

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;
export const DEFAULT_SAMPLE_BUDGET = 25;

// Live handoff: the WIF-authenticated claude-code-action writes a JSON map of
// `manifestPath -> proposal` to a file, and this backend reads it. Keeps the
// classifier on the repo's established action-based Claude pattern (no TS-side
// API key) while staying deterministically testable. A path with no entry
// yields `{}`, which fails schema validation and so escalates to needsHuman.
export function createFileScopeBackend(proposals: Record<string, unknown>): ScopeClassifierBackend {
  return {
    name: "file",
    propose: async (manifest) => proposals[manifest.path] ?? {},
  };
}

export function createStubScopeBackend(
  response: unknown | ((manifest: DiscoveredManifest) => unknown | Promise<unknown>),
): ScopeClassifierBackend {
  return {
    name: "stub",
    propose: async (manifest) =>
      typeof response === "function"
        ? (response as (m: DiscoveredManifest) => unknown)(manifest)
        : response,
  };
}

function escalated(manifest: DiscoveredManifest, rationale: string): PromotionDecision {
  return {
    path: manifest.path,
    ecosystem: manifest.ecosystem,
    parser: manifest.parser,
    track: "report-only",
    rationale,
    needsHuman: true,
  };
}

export async function proposeTrack(
  manifest: DiscoveredManifest,
  backend: ScopeClassifierBackend,
  options: ClassifyOptions = {},
): Promise<PromotionDecision> {
  const threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  let raw: unknown;
  try {
    raw = await backend.propose(manifest);
  } catch (error) {
    options.onWarning?.(
      `scope classifier backend failed for ${manifest.path}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return escalated(manifest, "classifier backend error; escalated to human");
  }

  const parsed = scopeProposalSchema.safeParse(raw);
  if (!parsed.success) {
    options.onWarning?.(
      `scope classifier returned an invalid proposal for ${manifest.path}: ${parsed.error.message}`,
    );
    return escalated(manifest, "invalid classifier proposal; escalated to human");
  }

  const proposal = parsed.data;

  // The clamp: emergency is never autonomously grantable.
  if (proposal.proposedTrack === "emergency") {
    options.onWarning?.(
      `scope classifier proposed emergency for ${manifest.path}; clamped to human escalation`,
    );
    return escalated(manifest, "classifier proposed emergency; emergency is human-only, escalated");
  }

  if (proposal.confidence < threshold) {
    return escalated(
      manifest,
      `classifier confidence ${proposal.confidence} below threshold ${threshold}; escalated`,
    );
  }

  return {
    path: manifest.path,
    ecosystem: manifest.ecosystem,
    parser: manifest.parser,
    track: proposal.proposedTrack,
    rationale: `classifier: ${proposal.rationale}`,
    needsHuman: false,
  };
}

// Apply the classifier to a drift report's needsHuman manifests, bounded by the
// sample budget. Manifests beyond the budget remain needsHuman (never silently
// dropped). Returns a new DriftReport with updated `added`/`needsHuman`.
export async function classifyDrift(
  report: DriftReport,
  backend: ScopeClassifierBackend,
  options: ClassifyOptions = {},
): Promise<DriftReport> {
  const budget = options.sampleBudget ?? DEFAULT_SAMPLE_BUDGET;
  let classified = 0;

  const added: PromotionDecision[] = [];
  for (const decision of report.added) {
    if (decision.needsHuman && classified < budget) {
      classified += 1;
      added.push(
        await proposeTrack(
          {
            path: decision.path,
            ecosystem: decision.ecosystem as DiscoveredManifest["ecosystem"],
            parser: decision.parser,
          },
          backend,
          options,
        ),
      );
    } else {
      added.push(decision);
    }
  }

  if (classified === budget) {
    const remaining = report.added.filter((d) => d.needsHuman).length - budget;
    if (remaining > 0) {
      options.onWarning?.(
        `scope classifier sample budget (${budget}) reached; ${remaining} manifest(s) remain escalated to human`,
      );
    }
  }

  const needsHuman = added.filter((decision) => decision.needsHuman);
  return { ...report, added, needsHuman };
}
