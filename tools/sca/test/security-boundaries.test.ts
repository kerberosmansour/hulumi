import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { normalizeEvidence } from "../src/evidence/normalize.ts";
import {
  assertEmergencyInvariant,
  defaultRouteConfig,
  routeEvidence,
} from "../src/classify/route.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureScannerBinary, scanProject, verifyScannerBinary } from "../src/cli/scan.ts";
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

const scannerAssetName = (() => {
  const key = `${process.platform}-${process.arch}`;
  const names: Record<string, string> = {
    "darwin-arm64": "osv-scanner_darwin_arm64",
    "darwin-x64": "osv-scanner_darwin_amd64",
    "linux-arm64": "osv-scanner_linux_arm64",
    "linux-x64": "osv-scanner_linux_amd64",
  };
  const name = names[key];
  if (name === undefined) throw new Error(`unsupported test platform: ${key}`);
  return name;
})();

async function scannerSandbox() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-hostile-repo-")));
  const cache = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-external-cache-")));
  return { root, cache };
}

async function writeLegacyRepositoryCache(root: string, target: string): Promise<void> {
  const destination = join(root, ".cache/osv-scanner/v2.3.8", scannerAssetName);
  await mkdir(join(root, ".cache/osv-scanner/v2.3.8"), { recursive: true });
  await writeFile(destination, target, { mode: 0o755 });
  await chmod(destination, 0o755);
}

async function writeExternalCandidate(cache: string, target: string): Promise<string> {
  const directory = join(cache, "v2.7.0");
  const destination = join(directory, scannerAssetName);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(destination, target, { mode: 0o755 });
  await chmod(destination, 0o755);
  return destination;
}

test("wrong-digest cached scanner fails closed instead of executing repository content", async () => {
  const { root, cache } = await scannerSandbox();
  const oldPath = process.env.PATH;
  const oldCache = process.env.HULUMI_SCA_CACHE_DIR;
  const oldOverride = process.env.OSV_SCANNER_BIN;
  try {
    process.env.PATH = "";
    process.env.HULUMI_SCA_CACHE_DIR = cache;
    delete process.env.OSV_SCANNER_BIN;
    await writeLegacyRepositoryCache(root, "#!/bin/sh\nexit 0\n");
    await writeExternalCandidate(cache, "#!/bin/sh\nexit 0\n");

    await assert.rejects(ensureScannerBinary(root), /checksum|integrity/i);
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldCache === undefined) delete process.env.HULUMI_SCA_CACHE_DIR;
    else process.env.HULUMI_SCA_CACHE_DIR = oldCache;
    if (oldOverride === undefined) delete process.env.OSV_SCANNER_BIN;
    else process.env.OSV_SCANNER_BIN = oldOverride;
    await rm(root, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
});

test("scanner cache symlink fails closed before following its target", async () => {
  const { root, cache } = await scannerSandbox();
  const oldPath = process.env.PATH;
  const oldCache = process.env.HULUMI_SCA_CACHE_DIR;
  const oldOverride = process.env.OSV_SCANNER_BIN;
  try {
    process.env.PATH = "";
    process.env.HULUMI_SCA_CACHE_DIR = cache;
    delete process.env.OSV_SCANNER_BIN;
    const target = join(root, "attacker-scanner");
    await writeFile(target, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    const legacyDirectory = join(root, ".cache/osv-scanner/v2.3.8");
    await mkdir(legacyDirectory, { recursive: true });
    await symlink(target, join(legacyDirectory, scannerAssetName));
    const externalDirectory = join(cache, "v2.7.0");
    await mkdir(externalDirectory, { recursive: true, mode: 0o700 });
    await symlink(target, join(externalDirectory, scannerAssetName));

    await assert.rejects(ensureScannerBinary(root), /symbolic link|symlink/i);
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldCache === undefined) delete process.env.HULUMI_SCA_CACHE_DIR;
    else process.env.HULUMI_SCA_CACHE_DIR = oldCache;
    if (oldOverride === undefined) delete process.env.OSV_SCANNER_BIN;
    else process.env.OSV_SCANNER_BIN = oldOverride;
    await rm(root, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
});

test("scanner cache parent symlink is rejected before creating content through it", async () => {
  const { root, cache } = await scannerSandbox();
  const symlinkTarget = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-link-target-")));
  const oldCache = process.env.HULUMI_SCA_CACHE_DIR;
  const oldOverride = process.env.OSV_SCANNER_BIN;
  try {
    const linkedParent = join(cache, "linked-parent");
    await symlink(symlinkTarget, linkedParent);
    process.env.HULUMI_SCA_CACHE_DIR = join(linkedParent, "scanner-cache");
    delete process.env.OSV_SCANNER_BIN;

    await assert.rejects(ensureScannerBinary(root), /symbolic link|symlink/i);
    await assert.rejects(access(join(symlinkTarget, "scanner-cache")));
  } finally {
    if (oldCache === undefined) delete process.env.HULUMI_SCA_CACHE_DIR;
    else process.env.HULUMI_SCA_CACHE_DIR = oldCache;
    if (oldOverride === undefined) delete process.env.OSV_SCANNER_BIN;
    else process.env.OSV_SCANNER_BIN = oldOverride;
    await rm(root, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
    await rm(symlinkTarget, { recursive: true, force: true });
  }
});

test(
  "unverified scanner on PATH is never invoked",
  { skip: process.platform === "win32" },
  async () => {
    const { root, cache } = await scannerSandbox();
    const pathDirectory = await mkdtemp(join(tmpdir(), "hulumi-sca-fake-path-"));
    const fakeScanner = join(pathDirectory, "osv-scanner");
    const marker = `${fakeScanner}.invoked`;
    const oldPath = process.env.PATH;
    const oldCache = process.env.HULUMI_SCA_CACHE_DIR;
    const oldOverride = process.env.OSV_SCANNER_BIN;
    try {
      await writeFile(fakeScanner, '#!/bin/sh\ntouch "$0.invoked"\nexit 0\n', { mode: 0o755 });
      await chmod(fakeScanner, 0o755);
      process.env.PATH = pathDirectory;
      process.env.HULUMI_SCA_CACHE_DIR = cache;
      delete process.env.OSV_SCANNER_BIN;
      await writeExternalCandidate(cache, "wrong digest");

      await assert.rejects(ensureScannerBinary(root), /checksum|integrity/i);
      await assert.rejects(access(marker));
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      if (oldCache === undefined) delete process.env.HULUMI_SCA_CACHE_DIR;
      else process.env.HULUMI_SCA_CACHE_DIR = oldCache;
      if (oldOverride === undefined) delete process.env.OSV_SCANNER_BIN;
      else process.env.OSV_SCANNER_BIN = oldOverride;
      await rm(root, { recursive: true, force: true });
      await rm(cache, { recursive: true, force: true });
      await rm(pathDirectory, { recursive: true, force: true });
    }
  },
);

test("explicit scanner override must be an absolute pinned binary outside the repository", async () => {
  const { root, cache } = await scannerSandbox();
  const oldCache = process.env.HULUMI_SCA_CACHE_DIR;
  const oldOverride = process.env.OSV_SCANNER_BIN;
  try {
    process.env.HULUMI_SCA_CACHE_DIR = cache;
    process.env.OSV_SCANNER_BIN = "relative/unverified-osv-scanner";
    await assert.rejects(ensureScannerBinary(root), /absolute|checksum|integrity/i);
  } finally {
    if (oldCache === undefined) delete process.env.HULUMI_SCA_CACHE_DIR;
    else process.env.HULUMI_SCA_CACHE_DIR = oldCache;
    if (oldOverride === undefined) delete process.env.OSV_SCANNER_BIN;
    else process.env.OSV_SCANNER_BIN = oldOverride;
    await rm(root, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
});

test("explicit scanner override inside the scanned repository is rejected", async () => {
  const { root, cache } = await scannerSandbox();
  const oldCache = process.env.HULUMI_SCA_CACHE_DIR;
  const oldOverride = process.env.OSV_SCANNER_BIN;
  try {
    const repositoryBinary = join(root, scannerAssetName);
    await writeFile(repositoryBinary, "repository controlled", { mode: 0o700 });
    process.env.HULUMI_SCA_CACHE_DIR = cache;
    process.env.OSV_SCANNER_BIN = repositoryBinary;
    await assert.rejects(ensureScannerBinary(root), /outside.*repository|repository.*outside/i);
  } finally {
    if (oldCache === undefined) delete process.env.HULUMI_SCA_CACHE_DIR;
    else process.env.HULUMI_SCA_CACHE_DIR = oldCache;
    if (oldOverride === undefined) delete process.env.OSV_SCANNER_BIN;
    else process.env.OSV_SCANNER_BIN = oldOverride;
    await rm(root, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
});

test("scanner verification rehashes the executable after a successful check", async () => {
  const { root, cache } = await scannerSandbox();
  try {
    const bytes = "synthetic admitted scanner";
    const expected = createHash("sha256").update(bytes).digest("hex");
    const candidate = await writeExternalCandidate(cache, bytes);

    assert.equal(await verifyScannerBinary(candidate, expected, root, cache), candidate);
    await writeFile(candidate, "mutated scanner bytes", { mode: 0o700 });
    await assert.rejects(
      verifyScannerBinary(candidate, expected, root, cache),
      /checksum|integrity/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
});

test(
  "scanner verification rejects group or world-writable executables",
  { skip: process.platform === "win32" },
  async () => {
    const { root, cache } = await scannerSandbox();
    try {
      const bytes = "synthetic admitted scanner";
      const expected = createHash("sha256").update(bytes).digest("hex");
      const candidate = await writeExternalCandidate(cache, bytes);
      await chmod(candidate, 0o722);

      await assert.rejects(
        verifyScannerBinary(candidate, expected, root, cache),
        /group\/world-writable|permissions/i,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(cache, { recursive: true, force: true });
    }
  },
);

test(
  "existing cache directory with group or world access fails closed",
  { skip: process.platform === "win32" },
  async () => {
    const { root, cache } = await scannerSandbox();
    const oldCache = process.env.HULUMI_SCA_CACHE_DIR;
    const oldOverride = process.env.OSV_SCANNER_BIN;
    try {
      await chmod(cache, 0o777);
      process.env.HULUMI_SCA_CACHE_DIR = cache;
      delete process.env.OSV_SCANNER_BIN;

      await assert.rejects(ensureScannerBinary(root), /group or world access|permissions/i);
    } finally {
      if (oldCache === undefined) delete process.env.HULUMI_SCA_CACHE_DIR;
      else process.env.HULUMI_SCA_CACHE_DIR = oldCache;
      if (oldOverride === undefined) delete process.env.OSV_SCANNER_BIN;
      else process.env.OSV_SCANNER_BIN = oldOverride;
      await rm(root, { recursive: true, force: true });
      await rm(cache, { recursive: true, force: true });
    }
  },
);

test("scanner cache root inside the scanned repository is rejected", async () => {
  const { root, cache } = await scannerSandbox();
  const oldPath = process.env.PATH;
  const oldCache = process.env.HULUMI_SCA_CACHE_DIR;
  const oldOverride = process.env.OSV_SCANNER_BIN;
  try {
    process.env.PATH = "";
    process.env.HULUMI_SCA_CACHE_DIR = join(root, ".scanner-cache");
    delete process.env.OSV_SCANNER_BIN;
    await writeLegacyRepositoryCache(root, "#!/bin/sh\nexit 0\n");

    await assert.rejects(ensureScannerBinary(root), /outside.*repository|repository.*outside/i);
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldCache === undefined) delete process.env.HULUMI_SCA_CACHE_DIR;
    else process.env.HULUMI_SCA_CACHE_DIR = oldCache;
    if (oldOverride === undefined) delete process.env.OSV_SCANNER_BIN;
    else process.env.OSV_SCANNER_BIN = oldOverride;
    await rm(root, { recursive: true, force: true });
    await rm(cache, { recursive: true, force: true });
  }
});
