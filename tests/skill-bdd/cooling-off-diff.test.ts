// Cooling-off-diff fixture-replay BDD (Runbook hulumi-pre-public-launch M3).
//
// Exercises `scripts/cooling-off-diff.mjs` against synthetic
// `pnpm-lock.yaml` fixtures. Subprocess-based: we run the script the way
// CI does and assert exit code + stdout/stderr substrings.
//
// Network-gated: the script calls `https://registry.npmjs.org/<pkg>` to
// look up publish times for any detected `@pulumi/*` bump. By default
// vitest skips the network-touching scenarios; opt in with
// `HULUMI_NETWORK_TESTS=1` (mirrors the existing HULUMI_INTEGRATION
// gate convention used in packages/{baseline,drift}/tests/integration).
//
// The "no-bump" scenario does not touch the network and runs every time.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");
const script = resolve(repoRoot, "scripts", "cooling-off-diff.mjs");
const fixturesDir = resolve(__dirname, "fixtures", "cooling-off-diff");

const RUN_NETWORK = process.env.HULUMI_NETWORK_TESTS === "1";
const itIfNetwork = RUN_NETWORK ? it : it.skip;

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runCoolingOff(baseFixture: string, headFixture: string): RunResult {
  const result = spawnSync(
    process.execPath,
    [script, resolve(fixturesDir, baseFixture), resolve(fixturesDir, headFixture)],
    { encoding: "utf8", timeout: 30_000 },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("Feature: cooling-off-diff fixture-replay (Runbook hulumi-pre-public-launch M3)", () => {
  describe("Scenario: no @pulumi/* bumps", () => {
    it("base = head returns exit 0 and skips registry lookup (no network)", () => {
      const result = runCoolingOff("baseline.lock.yaml", "baseline.lock.yaml");
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/no @pulumi\/\* bumps/);
    });

    it("lockfile with no @pulumi/* keys returns exit 0", () => {
      const result = runCoolingOff("no-pulumi-packages.lock.yaml", "no-pulumi-packages.lock.yaml");
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/no @pulumi\/\* bumps/);
    });
  });

  describe("Scenario: aged @pulumi/* bump satisfies cooling-off (network)", () => {
    // The aged-pulumi-bump fixture has @pulumi/pulumi@3.100.0; the baseline
    // has @pulumi/pulumi@3.232.0. Run base=aged head=baseline so the diff
    // is an UPGRADE (3.100.0 → 3.232.0) which classifies as a minor bump.
    // 3.232.0 was published well over 72h ago, so cooling-off accepts it.
    itIfNetwork("aged → @pulumi/pulumi@3.232.0 returns exit 0 (minor bump, well-aged)", () => {
      const result = runCoolingOff("aged-pulumi-bump.lock.yaml", "baseline.lock.yaml");
      expect(result.status, `stderr: ${result.stderr}\nstdout: ${result.stdout}`).toBe(0);
      expect(result.stdout).toMatch(/cooling-off: OK/);
      expect(result.stdout).toMatch(/@pulumi\/pulumi@3\.232\.0/);
    });
  });

  describe("Scenario: bump to non-existent version (network — fail-closed)", () => {
    // Treat baseline as "before" and nonexistent-version as "after" so the
    // diff is an upgrade (3.232.0 → 99.99.99). The classifier sees a major
    // bump and tries to fetch publish time — registry has no entry → fail
    // closed (exit 2).
    itIfNetwork(
      "baseline → @pulumi/pulumi@99.99.99 fails closed at registry lookup (exit 2)",
      () => {
        const result = runCoolingOff("baseline.lock.yaml", "nonexistent-version.lock.yaml");
        expect(result.status).toBe(2);
        expect(result.stderr).toMatch(/registry/i);
      },
    );
  });

  describe("Scenario: invocation hygiene (no network)", () => {
    it("script with missing args exits 2 (usage error — fail-closed)", () => {
      const result = spawnSync(process.execPath, [script], {
        encoding: "utf8",
        timeout: 5_000,
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/Usage:/);
    });
  });
});
