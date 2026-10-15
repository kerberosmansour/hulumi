import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { normalizeEvidence } from "../src/evidence/normalize.ts";
import {
  assertEmergencyInvariant,
  defaultRouteConfig,
  routeEvidence,
} from "../src/classify/route.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanProject } from "../src/cli/scan.ts";
import {
  classifyManifest,
  conventionsSchema,
  DEFAULT_CONVENTIONS,
  diffScope,
  globToRegExp,
  proposeScope,
  scopeFileSchema,
} from "../src/scope/policy.ts";

const manifest = (path: string) => ({ path, ecosystem: "npm" as const, parser: "package-lock" });

test("new acting manifests receive cadence, never emergency authority", () => {
  const result = classifyManifest(manifest("packages/app/package-lock.json"));
  assert.equal(result.track, "cadence");
  assert.equal(result.needsHuman, false);
});

test("vulnerable fixture exclusion takes precedence over an acting path", () => {
  const result = classifyManifest(manifest("packages/app/fixtures/vulnerable/package-lock.json"));
  assert.equal(result.track, "report-only");
  assert.equal(result.needsHuman, false);
});

test("unknown paths are still scanned and require classification", () => {
  const result = classifyManifest(manifest("new-runtime/package-lock.json"));
  assert.equal(result.track, "report-only");
  assert.equal(result.needsHuman, true);
});

for (const field of ["actingTrack", "excludedTrack", "unclassifiedTrack"]) {
  test(`untrusted conventions cannot set ${field} to emergency`, () => {
    assert.equal(
      conventionsSchema.safeParse({ ...DEFAULT_CONVENTIONS, [field]: "emergency" }).success,
      false,
    );
  });
}

test("literal regex syntax in a path cannot widen scope", () => {
  const pattern = globToRegExp("packages/app.(trusted)/**");
  assert.equal(pattern.test("packages/app.(trusted)/package-lock.json"), true);
  assert.equal(pattern.test("packages/appXtrusted/package-lock.json"), false);
});

test("drift proposal preserves the explicitly assigned human track", () => {
  const existing = { ...manifest("packages/app/package-lock.json"), track: "report-only" };
  const scope = scopeFileSchema.parse({
    version: 1,
    conventions: DEFAULT_CONVENTIONS,
    manifests: [existing],
  });
  const report = diffScope(
    [manifest(existing.path), manifest("packages/new/package-lock.json")],
    scope,
  );
  const proposed = proposeScope(report);
  assert.equal(proposed.manifests.find((m) => m.path === existing.path)?.track, "report-only");
  assert.equal(proposed.manifests.find((m) => m.path.includes("/new/"))?.track, "cadence");
  assert.equal(
    proposed.manifests.some((m) => m.track === "emergency"),
    false,
  );
});

test("malformed dependency input fails with its original cause and no clean report", async () => {
  const root = await mkdtemp(join(tmpdir(), "hulumi-sca-malformed-"));
  try {
    await writeFile(join(root, "package-lock.json"), "{not-json");
    await writeFile(
      join(root, "sca-scope.json"),
      JSON.stringify({
        version: 1,
        conventions: DEFAULT_CONVENTIONS,
        manifests: [
          { ...manifest("package-lock.json"), parser: "package-lock.json", track: "report-only" },
        ],
      }),
    );
    await assert.rejects(
      scanProject({ rootDir: root, useScope: true, scannerMode: "fixture" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /^malformed lockfile: package-lock.json:/);
        assert.ok(error.cause instanceof SyntaxError);
        return true;
      },
    );
    await assert.rejects(access(join(root, "findings.osv.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const maliciousEvidence = (fixedVersion: string | null) =>
  normalizeEvidence({
    finding: {
      ecosystem: "npm",
      package: "synthetic-not-installed",
      version: "0.0.0",
      advisoryId: "MAL-TEST-0001",
      manifestPath: "package-lock.json",
    },
    osv: { severityClass: "malicious", fixedVersion },
    dependencyReview: { present: true, vulnerableTransitives: [] },
    ghsa: { cvss: 0 },
    kev: { listed: false },
    epss: { score: 0 },
  });

for (const missing of [null, "", "   "]) {
  test(`a present malicious package without a valid fixed release fails: ${JSON.stringify(missing)}`, () => {
    assert.throws(
      () => routeEvidence(maliciousEvidence(missing)),
      /known malicious.*remove.*investigat/i,
    );
  });
}

test("disabling the generic fixed-release preference cannot waive malicious removal", () => {
  const config = { emergency: { ...defaultRouteConfig.emergency, requireFixAvailable: false } };
  assert.throws(
    () => routeEvidence(maliciousEvidence(null), config),
    /known malicious.*remove.*investigat/i,
  );
});

test("legacy optional flags cannot demote a fixable malicious package", () => {
  const config = { emergency: { ...defaultRouteConfig.emergency, treatMalAsEmergency: false } };
  assert.deepEqual(routeEvidence(maliciousEvidence("0.0.1"), config), { track: "emergency" });
  assert.doesNotThrow(() => assertEmergencyInvariant(maliciousEvidence("0.0.1"), config));
});

test("ordinary low-risk vulnerability routing stays unchanged", () => {
  const evidence = maliciousEvidence("0.0.1");
  evidence.osv.class = "critical";
  assert.deepEqual(routeEvidence(evidence), { track: "cadence" });
  evidence.osv.fixedVersion = null;
  assert.deepEqual(routeEvidence(evidence), { track: "dropped", reason: "no fix" });
});

test("real triage CLI fails closed on MAL with no fix and preserves scanner/state evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "hulumi-sca-mal-triage-"));
  try {
    const findings = join(root, "findings.json"),
      state = join(root, "state.json"),
      work = join(root, "work.json");
    const input = JSON.stringify({ findings: [maliciousEvidence(null).raw] });
    const previousState = JSON.stringify({ version: 1, revision: 7, findings: {} });
    await writeFile(findings, input);
    await writeFile(state, previousState);
    const cli = fileURLToPath(new URL("../src/cli/triage.ts", import.meta.url));
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        cli,
        "triage",
        "--findings",
        findings,
        "--state",
        state,
        "--work-items",
        work,
        "--events",
        join(root, "events.json"),
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert.match(child.stderr, /known malicious.*remove.*investigat/i);
    assert.equal(await readFile(findings, "utf8"), input);
    assert.equal(await readFile(state, "utf8"), previousState);
    await assert.rejects(access(work));
    await assert.rejects(access(join(root, "events.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
