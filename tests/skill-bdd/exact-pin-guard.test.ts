// Exact-pin-guard BDD (Runbook hulumi-pre-public-launch M4).
//
// The pin-guard runs as a script in CI; we exercise it as a subprocess
// the way CI does and assert observable behavior. We also walk the
// script's source to confirm the ALLOWED table covers the deps we care
// about — this catches the case where a future refactor accidentally
// removes an entry without breaking the integrity check (e.g. removing
// the entry AND the dep from the lockfile in the same PR).

import {
  existsSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");
const script = resolve(repoRoot, "scripts", "exact-pin-guard.mjs");
const scriptSource = readFileSync(script, "utf8");

// The 5 drift runtime deps that M4 adds to ALLOWED — encoded so a future
// removal that doesn't replace them with equivalents trips the test.
const M4_DRIFT_DEPS = [
  "@aws-sdk/client-cloudtrail",
  "@aws-sdk/client-sts",
  "@aws-sdk/credential-providers",
  "p-timeout",
  "simple-git",
] as const;

describe("Feature: Pin-guard extension + dead-code cleanup (Runbook hulumi-pre-public-launch M4)", () => {
  describe("Scenario: pin-guard runs successfully against the current lockfile", () => {
    it("subprocess exits 0 and reports the expanded scope", () => {
      const result = spawnSync(process.execPath, [script], {
        encoding: "utf8",
        cwd: repoRoot,
        timeout: 30_000,
      });
      expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).toBe(0);
      expect(result.stdout).toMatch(/exact-pin-guard: OK/);
      // After M4 the message must reflect the broader scope: not just @pulumi/*.
      expect(result.stdout).toMatch(/pinned deps have exact manifest specs/);
    });
  });

  describe("Scenario: ALLOWED includes drift's runtime deps", () => {
    it.each(M4_DRIFT_DEPS)("ALLOWED contains a `%s` entry", (depName) => {
      // Match the `name: "<depName>"` line in the ALLOWED table source.
      // Using a permissive regex so the test stays valid if the version
      // bumps (M4 cares about presence, not the specific version).
      const re = new RegExp(`name:\\s*["']${depName.replace(/\//g, "\\/")}["']`);
      expect(scriptSource, `ALLOWED is missing an entry for ${depName}`).toMatch(re);
    });
  });

  describe("Scenario: dead-code removal — packages/baseline/src/aws/probes/poll.ts", () => {
    it("poll.ts no longer exists", () => {
      const pollPath = resolve(repoRoot, "packages", "baseline", "src", "aws", "probes", "poll.ts");
      expect(existsSync(pollPath), `poll.ts still exists at ${pollPath}`).toBe(false);
    });

    it("ARCHITECTURE.md keeps the vitest-pool gotcha narrative without the escape-hatch pointer", () => {
      const arch = readFileSync(resolve(repoRoot, "docs", "ARCHITECTURE.md"), "utf8");
      // The narrative survives:
      expect(arch).toMatch(/pulumi\.dynamic\.Resource.*does NOT work under vitest/);
      // The escape-hatch pointer is dropped:
      expect(arch).not.toMatch(/escape hatch at.*probes\/poll\.ts/);
    });
  });

  describe("Scenario: pin-guard fails closed on missing integrity or non-exact manifest pins", () => {
    // Tampering scripts/exact-pin-guard.mjs in CI is hostile to other
    // tests; we verify the failure-mode by inspection instead.
    it("script source contains the fail-closed protected-dep branch", () => {
      expect(scriptSource).toMatch(/isExactVersion/);
      expect(scriptSource).toMatch(/missing a lockfile integrity hash/);
      expect(scriptSource).toMatch(/process\.exit\(1\)/);
    });
  });

  describe("Scenario: Dependabot can move protected pins without a second CI-triggering commit", () => {
    it("script source derives pins from exact manifests + pnpm-lock integrity and keeps --write for audit diffs", () => {
      expect(scriptSource).toMatch(/--write/);
      expect(scriptSource).toMatch(/refreshedAllowedFromManifests/);
      expect(scriptSource).toMatch(/isExactVersion/);
      expect(scriptSource).toMatch(/missing a lockfile integrity hash/);
    });
  });

  describe("Scenario: pin-guard does not check @hulumi/* deps", () => {
    it("ALLOWED contains no @hulumi/* entries (those are publish targets, not transitive deps)", () => {
      const allowedBlock = scriptSource.slice(
        scriptSource.indexOf("const ALLOWED"),
        scriptSource.indexOf("function resolveFromLockfile"),
      );
      expect(allowedBlock).not.toMatch(/name:\s*["']@hulumi\//);
    });
  });
});

it("rejects a protected integrity change even when the manifest remains exact", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "hulumi-pin-guard-"));
  try {
    mkdirSync(join(sandbox, "scripts"));
    cpSync(script, join(sandbox, "scripts/exact-pin-guard.mjs"));
    cpSync(join(repoRoot, "package.json"), join(sandbox, "package.json"));
    cpSync(join(repoRoot, "packages"), join(sandbox, "packages"), {
      recursive: true,
      filter: (path) =>
        !path.includes("node_modules") &&
        !path.includes("dist") &&
        !path.includes("tests") &&
        !path.includes("src"),
    });
    const integrity = scriptSource.match(/integrity:\s*\n?\s*"(sha512-[^"]+)"/)![1];
    const lock = readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8");
    expect(lock).toContain(integrity);
    writeFileSync(
      join(sandbox, "pnpm-lock.yaml"),
      lock.replaceAll(integrity, "sha512-unreviewed-bytes"),
    );
    const result = spawnSync(process.execPath, [join(sandbox, "scripts/exact-pin-guard.mjs")], {
      encoding: "utf8",
      timeout: 30000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("reviewed pin");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
