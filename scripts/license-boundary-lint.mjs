#!/usr/bin/env node
// license-boundary-lint — refuse to let verbatim CCM / AICM / CIS control
// text sneak into Apache-2.0 source. IDs are fine; prose requires a commercial
// license per the CSA & CIS licensing terms. See docs/mappings/licensing.md.
//
// Scope: scans skills/ and any future packages/ source trees (TS, MD, JSON).
// Does NOT scan docs/ (docs can quote and cite as permitted, though we still
// prefer paraphrase; licensing.md documents the policy per-doc).
//
// Strategy: known-distinctive-prose fixture list. Each entry is a verbatim
// substring taken from CCM v4.1, AICM v1, or CIS AWS Foundations v5.0.0 whose
// presence in source is a clear license violation. Matching is plain
// case-insensitive substring search — if we need regex, the fixture gets
// upgraded with explicit metadata.
//
// Exit code: 0 = clean; 1 = hits.

import { readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(fileURLToPath(import.meta.url), "..", "..");

// Directories to scan. Shipped surfaces only — tests/ contains deliberate
// fixture content that would false-positive this lint (and tests are not
// shipped to end users of the Claude Code skill or the npm packages).
const SCAN_ROOTS = ["skills", "packages"];

// Files to scan (by extension).
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md"]);

// Paths to skip inside the scan roots.
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".vitest"]);

// Distinctive verbatim-prose fixtures. Each is a substring whose presence in
// source would constitute unlicensed embedding. Sourced from the public
// summaries; the fixtures themselves are SHORT enough to be fair-use
// references in lint tooling (they exist to detect misuse, not to reproduce).
// Maintainers: do NOT add long excerpts here — keep each fixture under 80
// chars. Additions require a CONTRIBUTING.md-documented rationale.
const KNOWN_VERBATIM_FIXTURES = [
  // CCM v4.1 representative fragments (short, highly distinctive).
  "A policy and procedures for cryptographic",
  "The organization shall establish, document",
  "Implementation Guidelines: The organization",
  // CAIQ question-style openers that betray direct copy.
  "Are cryptographic, encryption and key management",
  "Do you maintain a formalized policy and procedures",
  // CIS AWS Foundations Benchmark boilerplate phrases.
  "This Benchmark provides prescriptive guidance",
  "The CIS Benchmarks are consensus-based",
];

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      const dotIdx = entry.name.lastIndexOf(".");
      const ext = dotIdx === -1 ? "" : entry.name.slice(dotIdx).toLowerCase();
      if (SCAN_EXTS.has(ext)) yield full;
    }
  }
}

async function main() {
  const hits = [];
  for (const root of SCAN_ROOTS) {
    const full = join(REPO_ROOT, root);
    try {
      await stat(full);
    } catch {
      continue; // root doesn't exist yet (e.g. packages/ pre-M2)
    }
    for await (const file of walk(full)) {
      const content = readFileSync(file, "utf8");
      const lower = content.toLowerCase();
      for (const fixture of KNOWN_VERBATIM_FIXTURES) {
        if (lower.includes(fixture.toLowerCase())) {
          hits.push({
            file: relative(REPO_ROOT, file),
            fixture,
          });
        }
      }
    }
  }

  if (hits.length > 0) {
    console.error("license-boundary-lint: FAIL");
    console.error(`Found ${hits.length} verbatim-prose hit(s). IDs-only policy violated.`);
    console.error("See docs/mappings/licensing.md for the policy and remediation.");
    console.error("");
    for (const hit of hits) {
      console.error(`  ${hit.file}:  "${hit.fixture}"`);
    }
    process.exit(1);
  }

  console.log("license-boundary-lint: OK (IDs-only policy upheld across scanned trees)");
}

main().catch((err) => {
  console.error("license-boundary-lint: internal error");
  console.error(err);
  process.exit(2);
});
