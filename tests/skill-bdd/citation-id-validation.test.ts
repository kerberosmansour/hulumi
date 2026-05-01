// Citation-ID validation meta-test (per critique E4 — accepted during /slo-execute M3).
//
// For every framework ID cited in any `skills/hulumi-threat-model/scenarios/*.json`'s
// `controls[]` arrays, assert the ID is present in the corresponding mapping
// table at `packages/baseline/src/mappings/<framework>.ts`.
//
// Catches fabricated IDs that pass the structural BDD assertions but cite
// section numbers / control IDs that don't exist in any Hulumi-shipped
// mapping table. In particular: a contributor adding a fifth scenario in
// v1.2 cannot accidentally cite `CIS-GH-99.99.99` (or any other invented
// ID) without this meta-test failing in CI.
//
// The 5 AWS scenarios are exempt from this check — the AWS mappings ship
// with detailed IDs in the markdown tables under `docs/mappings/`. This
// meta-test focuses on the GitHub-side scenarios where M3's mappings
// (cis-github + nist-ssdf-v1.1) are authored as `as const` arrays in
// the source tree.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");
const SCENARIOS_DIR = join(REPO_ROOT, "skills/hulumi-threat-model/scenarios");

interface Scenario {
  id: string;
  stride: { controls: string[] }[];
}

function loadGitHubScenarios(): Array<{ name: string; data: Scenario }> {
  return readdirSync(SCENARIOS_DIR)
    .filter((f) => f.startsWith("github-") && f.endsWith(".json"))
    .map((f) => ({
      name: f,
      data: JSON.parse(readFileSync(join(SCENARIOS_DIR, f), "utf8")) as Scenario,
    }));
}

// Frameworks whose IDs are sourced from `as const` mapping tables in
// packages/baseline/src/mappings/. Each entry maps a framework prefix
// (the part before `:`) to the list of accepted IDs, gathered from
// the mapping module export.
//
// Importing the mapping modules from this test file is awkward because
// vitest-config doesn't include the baseline workspace by default. We
// read the source files instead and extract the string literals.
function loadMappingIds(filename: string, framework: string): Set<string> {
  const path = join(REPO_ROOT, "packages/baseline/src/mappings", filename);
  const src = readFileSync(path, "utf8");
  // Match every quoted string starting with `<framework>:`.
  const re = new RegExp(`"(${framework}:[^"\\s]+)"`, "g");
  const ids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

const KNOWN_FRAMEWORKS: Array<{ prefix: string; mappingFile: string }> = [
  { prefix: "CIS-GitHub-v1.2.0", mappingFile: "cis-github.ts" },
  { prefix: "NIST-SSDF-v1.1", mappingFile: "nist-ssdf-v1.1.ts" },
];

// Frameworks that the generator accepts via BUNDLED_STUBS but for which
// no Hulumi-shipped mapping table exists (so the citation-ID meta-test
// is permissive — it only fails if a CITED ID belongs to a framework
// in KNOWN_FRAMEWORKS and is missing from the mapping file).
const BUNDLED_FRAMEWORKS_WITHOUT_MAPPING_TABLE = [
  "CCM",
  "NIST-800-53-r5",
  "NIST-800-218",
  "NIST-800-218A",
  "ATLAS",
  "OpenSSF-Scorecard",
  "MITRE-ATTCK",
  "GitHub-Well-Architected",
  "CIS-AWS-v5.0.0",
];

describe("Citation-ID validation meta-test (E4) — every CIS-GitHub-v1.2.0 / NIST-SSDF-v1.1 ID cited by a GitHub scenario is present in the mapping table", () => {
  const scenarios = loadGitHubScenarios();
  it("loads ≥ 4 GitHub scenarios", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(4);
  });

  for (const fw of KNOWN_FRAMEWORKS) {
    const acceptedIds = loadMappingIds(fw.mappingFile, fw.prefix);

    it(`every ${fw.prefix} ID cited in any github-* scenario is present in ${fw.mappingFile}`, () => {
      const offending: Array<{ scenario: string; id: string }> = [];
      for (const { name, data } of scenarios) {
        for (const stride of data.stride) {
          for (const ctrl of stride.controls) {
            if (!ctrl.startsWith(`${fw.prefix}:`)) continue;
            if (!acceptedIds.has(ctrl)) {
              offending.push({ scenario: name, id: ctrl });
            }
          }
        }
      }
      // If any offending IDs found, fail with a structured message.
      if (offending.length > 0) {
        const detail = offending
          .map((o) => `  - ${o.scenario} cites "${o.id}" — not present in ${fw.mappingFile}`)
          .join("\n");
        throw new Error(
          `Found ${offending.length} fabricated / unmapped ${fw.prefix} citation(s):\n${detail}\n\nAdd the IDs to packages/baseline/src/mappings/${fw.mappingFile} (or fix the scenario JSON).`,
        );
      }
    });
  }

  it("every framework prefix cited by any github-* scenario is recognized (KNOWN_FRAMEWORKS or BUNDLED_FRAMEWORKS_WITHOUT_MAPPING_TABLE)", () => {
    const allKnownPrefixes = new Set<string>([
      ...KNOWN_FRAMEWORKS.map((f) => f.prefix),
      ...BUNDLED_FRAMEWORKS_WITHOUT_MAPPING_TABLE,
    ]);
    const unrecognized: Array<{ scenario: string; prefix: string; id: string }> = [];
    for (const { name, data } of scenarios) {
      for (const stride of data.stride) {
        for (const ctrl of stride.controls) {
          const colonIdx = ctrl.indexOf(":");
          if (colonIdx === -1) {
            unrecognized.push({ scenario: name, prefix: "(no-colon)", id: ctrl });
            continue;
          }
          const prefix = ctrl.slice(0, colonIdx);
          if (!allKnownPrefixes.has(prefix)) {
            unrecognized.push({ scenario: name, prefix, id: ctrl });
          }
        }
      }
    }
    if (unrecognized.length > 0) {
      const detail = unrecognized
        .map(
          (o) =>
            `  - ${o.scenario} cites "${o.id}" — framework prefix "${o.prefix}" not in KNOWN_FRAMEWORKS or BUNDLED_FRAMEWORKS_WITHOUT_MAPPING_TABLE`,
        )
        .join("\n");
      throw new Error(
        `Found ${unrecognized.length} unrecognized framework prefix(es):\n${detail}\n\nEither add the framework to BUNDLED_STUBS in skills/hulumi-threat-model/scripts/generate-threat-model.mjs (and to BUNDLED_FRAMEWORKS_WITHOUT_MAPPING_TABLE here), OR ship a mapping table and add to KNOWN_FRAMEWORKS.`,
      );
    }
  });
});
