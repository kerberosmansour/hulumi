#!/usr/bin/env node

// Convention-gated scope promotion with ASYMMETRIC autonomy.
//
// Detection is exhaustive (see ../discovery/discover.ts); action is deliberate.
// This module decides, for each discovered manifest, which track it belongs to:
//
//   exclude convention   -> report-only / ignore   (autonomous, no human)
//   acting  convention   -> cadence                (autonomous, no human)
//   matches neither      -> report-only + needsHuman (scanned, escalated)
//
// The red line: NO autonomous path may produce `emergency`. Granting a manifest
// emergency (auto-merge-to-prod) authority is only ever a human-authored edit to
// the scope file. This is enforced structurally — the conventions schema forbids
// `emergency` as an acting/excluded/unclassified target, and classifyManifest
// can only return one of those convention targets.

import { z } from "zod";
import type { DiscoveredManifest } from "../discovery/discover";

// Full track vocabulary. `emergency` is reachable ONLY via a human-authored
// scope-file entry, never via classifyManifest/proposeScope.
export const TRACKS = ["emergency", "cadence", "report-only", "ignore"] as const;
export type Track = (typeof TRACKS)[number];

// The set of tracks an autonomous convention may assign. `emergency` is
// deliberately absent.
const AUTONOMOUS_TRACKS = ["cadence", "report-only", "ignore"] as const;

export const scopeEntrySchema = z
  .object({
    path: z.string().min(1),
    ecosystem: z.string().min(1),
    parser: z.string().min(1),
    track: z.enum(TRACKS),
    note: z.string().optional(),
  })
  .strict();

export type ScopeEntry = z.infer<typeof scopeEntrySchema>;

export const conventionsSchema = z
  .object({
    actingPaths: z.array(z.string().min(1)),
    excludePaths: z.array(z.string().min(1)),
    actingTrack: z.enum(AUTONOMOUS_TRACKS).default("cadence"),
    excludedTrack: z.enum(["report-only", "ignore"]).default("report-only"),
    unclassifiedTrack: z.enum(["report-only", "ignore"]).default("report-only"),
  })
  .strict();

export type Conventions = z.infer<typeof conventionsSchema>;

export const scopeFileSchema = z
  .object({
    version: z.literal(1),
    conventions: conventionsSchema,
    manifests: z.array(scopeEntrySchema),
  })
  .strict();

export type ScopeFile = z.infer<typeof scopeFileSchema>;

export interface PromotionDecision {
  path: string;
  ecosystem: string;
  parser: string;
  track: Track;
  rationale: string;
  needsHuman: boolean;
}

export interface DriftReport {
  firstRun: boolean;
  added: PromotionDecision[];
  removed: ScopeEntry[];
  unchanged: ScopeEntry[];
  needsHuman: PromotionDecision[];
  hasDrift: boolean;
}

// Sensible repo-shape defaults. A human tunes these once per repo.
export const DEFAULT_CONVENTIONS: Conventions = {
  actingPaths: ["apps/**", "services/**", "packages/**", "cmd/**"],
  excludePaths: [
    "**/examples/**",
    "**/example/**",
    "**/testdata/**",
    "**/tests/**",
    "**/test/**",
    "**/__tests__/**",
    "**/fixtures/**",
    "**/*fixture*/**",
    "**/vendor/**",
    "**/third_party/**",
    "**/.archive/**",
  ],
  actingTrack: "cadence",
  excludedTrack: "report-only",
  unclassifiedTrack: "report-only",
};

// Minimal, deterministic glob -> RegExp. Supports literal text, `*`
// (within a path segment), and `**` (across segments). All other regex
// metacharacters are escaped so a convention string cannot inject a pattern.
export function globToRegExp(glob: string): RegExp {
  let re = "^";
  let index = 0;
  while (index < glob.length) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        index += 2;
        if (glob[index] === "/") {
          // `**/` matches zero or more leading path segments.
          re += "(?:.*/)?";
          index += 1;
        } else {
          re += ".*";
        }
      } else {
        // `*` matches within a single path segment.
        re += "[^/]*";
        index += 1;
      }
    } else {
      re += escapeRegexChar(char);
      index += 1;
    }
  }
  return new RegExp(`${re}$`);
}

function escapeRegexChar(char: string): string {
  return /[\\^$+?.()|{}[\]]/.test(char) ? `\\${char}` : char;
}

function matchesAny(path: string, globs: string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(path));
}

export function classifyManifest(
  manifest: DiscoveredManifest,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): PromotionDecision {
  const base = {
    path: manifest.path,
    ecosystem: manifest.ecosystem,
    parser: manifest.parser,
  };

  // Exclude precedence is absolute: a path matching both an exclude and an
  // acting convention is classified by the exclude convention.
  if (matchesAny(manifest.path, conventions.excludePaths)) {
    return {
      ...base,
      track: conventions.excludedTrack,
      rationale: "matches an exclude convention",
      needsHuman: false,
    };
  }

  if (matchesAny(manifest.path, conventions.actingPaths)) {
    return {
      ...base,
      track: conventions.actingTrack,
      rationale: "matches an acting convention (autonomous promotion to cadence)",
      needsHuman: false,
    };
  }

  // Unknown: scanned (report-only) so it is never silently missed, but escalated
  // because granting any acting authority here is a deliberate human decision.
  return {
    ...base,
    track: conventions.unclassifiedTrack,
    rationale:
      "matches no convention; scanned but not granted acting authority — needs human classification",
    needsHuman: true,
  };
}

export function diffScope(
  discovered: DiscoveredManifest[],
  scope: ScopeFile,
  conventions: Conventions = scope.conventions,
): DriftReport {
  const scopeByPath = new Map(scope.manifests.map((m) => [m.path, m]));
  const discoveredPaths = new Set(discovered.map((m) => m.path));

  const unchanged: ScopeEntry[] = [];
  const added: PromotionDecision[] = [];

  for (const manifest of discovered) {
    const existing = scopeByPath.get(manifest.path);
    if (existing) {
      // Preserve the existing (possibly human-overridden) track — never
      // re-classify an already-scoped manifest.
      unchanged.push(existing);
    } else {
      added.push(classifyManifest(manifest, conventions));
    }
  }

  const removed = scope.manifests.filter((m) => !discoveredPaths.has(m.path));
  const needsHuman = added.filter((decision) => decision.needsHuman);
  const firstRun = scope.manifests.length === 0;
  const hasDrift = added.length > 0 || removed.length > 0;

  return { firstRun, added, removed, unchanged, needsHuman, hasDrift };
}

export function proposeScope(
  report: DriftReport,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): ScopeFile {
  const manifests: ScopeEntry[] = [
    ...report.unchanged,
    ...report.added.map((decision) => ({
      path: decision.path,
      ecosystem: decision.ecosystem,
      parser: decision.parser,
      track: decision.track,
    })),
  ].sort((a, b) => a.path.localeCompare(b.path));

  return scopeFileSchema.parse({ version: 1, conventions, manifests });
}
