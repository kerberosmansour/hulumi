import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { normalizeEvidence, type RawScanFinding } from "../src/evidence/normalize.ts";
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
import { dirname, join } from "node:path";
import { ensureScannerBinary, scanProject, verifyScannerBinary } from "../src/cli/scan.ts";
import { remediateFromFiles } from "../src/cli/remediate.ts";
import {
  classifyManifest,
  conventionsSchema,
  DEFAULT_CONVENTIONS,
  diffScope,
  globToRegExp,
  proposeScope,
  scopeFileSchema,
} from "../src/scope/policy.ts";

const remediationCli = fileURLToPath(new URL("../src/cli/remediate.ts", import.meta.url));
const tsxCli = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));

const remediationFinding = {
  ecosystem: "npm" as const,
  package: "lodash",
  version: "4.17.20",
  advisoryId: "GHSA-35jh-r3h4-6jhm",
};

function packageLock(version = remediationFinding.version) {
  return {
    name: "remediation-fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { [remediationFinding.package]: version } },
      [`node_modules/${remediationFinding.package}`]: { version },
    },
    dependencies: { [remediationFinding.package]: { version } },
  };
}

async function writeRemediationManifest(root: string, manifestPath: string) {
  const target = join(root, manifestPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(packageLock(), null, 2)}\n`);
  await writeFile(
    join(dirname(target), "package.json"),
    `${JSON.stringify({ dependencies: { [remediationFinding.package]: remediationFinding.version } }, null, 2)}\n`,
  );
}

function git(root: string, ...args: string[]) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function commitRemediationFixture(root: string) {
  git(root, "init", "-q");
  git(root, "config", "user.name", "Hulumi SCA Test");
  git(root, "config", "user.email", "sca-test@example.invalid");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "fixture");
  return git(root, "rev-parse", "HEAD");
}

async function writeRemediationWorkItem(
  directory: string,
  manifestPath: string,
  mutate?: (value: Record<string, unknown>) => void,
  finding: Omit<RawScanFinding, "manifestPath"> = remediationFinding,
  fixedVersion = "4.17.21",
) {
  const raw = { ...finding, manifestPath };
  const evidence = normalizeEvidence({
    finding: raw,
    osv: { fixedVersion, severityClass: "critical" },
    dependencyReview: { present: true, vulnerableTransitives: [] },
  });
  const value: Record<string, unknown> = {
    version: 1,
    workItems: [{ findingKey: evidence.findingKey, track: "emergency", state: "in_progress" }],
    evidence: [evidence],
  };
  mutate?.(value);
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const path = join(directory, "work-items.json");
  await writeFile(path, bytes);
  return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function runRemediation(
  root: string,
  workItemsPath: string,
  expectedRevision: string,
  expectedDigest: string,
  env?: NodeJS.ProcessEnv,
) {
  return spawnSync(
    tsxCli,
    [
      remediationCli,
      "remediate-emergency",
      "--work-items",
      workItemsPath,
      "--output",
      "remediation-result.json",
      "--apply",
      "true",
      "--repository-root",
      root,
      "--expected-revision",
      expectedRevision,
      "--work-items-sha256",
      expectedDigest,
    ],
    { cwd: root, encoding: "utf8", timeout: 10_000, env: { ...process.env, ...env } },
  );
}

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

test("remediation apply changes only the reviewed manifest pair at the exact revision", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-remediation-valid-")));
  try {
    await writeRemediationManifest(root, "package-lock.json");
    await writeFile(join(root, "sentinel.txt"), "unchanged\n");
    const revision = await commitRemediationFixture(root);
    const work = await writeRemediationWorkItem(root, "package-lock.json");

    const child = runRemediation(root, work.path, revision, work.sha256);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(
      JSON.parse(await readFile(join(root, "package.json"), "utf8")).dependencies.lodash,
      "4.17.21",
    );
    assert.equal(
      JSON.parse(await readFile(join(root, "package-lock.json"), "utf8")).packages[
        "node_modules/lodash"
      ].version,
      "4.17.21",
    );
    assert.equal(await readFile(join(root, "sentinel.txt"), "utf8"), "unchanged\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bounded remediation preserves exact PyPI and NuGet manifest syntax", async () => {
  const fixtures = [
    {
      ecosystem: "PyPI" as const,
      package: "demo.pkg",
      from: "1.2.3",
      to: "1.2.4",
      manifestPath: "requirements.txt",
      files: {
        "requirements.txt": "demo.pkg == 1.2.3  # retained comment\nother==9.0.0\n",
      },
      assertResult: async (root: string) => {
        assert.equal(
          await readFile(join(root, "requirements.txt"), "utf8"),
          "demo.pkg == 1.2.4  # retained comment\nother==9.0.0\n",
        );
      },
    },
    {
      ecosystem: "NuGet" as const,
      package: "Demo.Package",
      from: "2.3.4",
      to: "2.3.5",
      manifestPath: "packages.lock.json",
      files: {
        "packages.lock.json": `${JSON.stringify(
          {
            version: 1,
            dependencies: {
              "net8.0": {
                "Demo.Package": { type: "Direct", requested: "[2.3.4, )", resolved: "2.3.4" },
              },
            },
          },
          null,
          2,
        )}\n`,
        "worker-dotnet.csproj":
          '<Project><ItemGroup><PackageReference Include="Demo.Package" Version="2.3.4" /></ItemGroup></Project>\n',
      },
      assertResult: async (root: string) => {
        const lock = JSON.parse(await readFile(join(root, "packages.lock.json"), "utf8"));
        assert.equal(lock.dependencies["net8.0"]["Demo.Package"].resolved, "2.3.5");
        assert.equal(lock.dependencies["net8.0"]["Demo.Package"].requested, "[2.3.5, )");
        assert.match(
          await readFile(join(root, "worker-dotnet.csproj"), "utf8"),
          /Include="Demo\.Package" Version="2\.3\.5"/,
        );
      },
    },
  ];

  for (const fixture of fixtures) {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), `hulumi-sca-remediation-${fixture.ecosystem.toLowerCase()}-`)),
    );
    try {
      for (const [path, contents] of Object.entries(fixture.files)) {
        await writeFile(join(root, path), contents);
      }
      const revision = await commitRemediationFixture(root);
      const work = await writeRemediationWorkItem(
        root,
        fixture.manifestPath,
        undefined,
        {
          ecosystem: fixture.ecosystem,
          package: fixture.package,
          version: fixture.from,
          advisoryId: "GHSA-fixture-remediation",
        },
        fixture.to,
      );

      const child = runRemediation(root, work.path, revision, work.sha256);
      assert.equal(child.status, 0, child.stderr);
      await fixture.assertResult(root);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

for (const kind of ["absolute", "traversal"] as const) {
  const article = kind === "absolute" ? "an" : "a";
  test(`remediation rejects ${article} ${kind} manifest path before touching an outside repository`, async () => {
    const parent = await realpath(await mkdtemp(join(tmpdir(), `hulumi-sca-remediation-${kind}-`)));
    const root = join(parent, "repo");
    const outside = join(parent, "outside");
    await mkdir(root);
    await mkdir(outside);
    try {
      await writeRemediationManifest(outside, "package-lock.json");
      await writeFile(join(root, "sentinel.txt"), "trusted checkout\n");
      const before = await readFile(join(outside, "package-lock.json"), "utf8");
      const revision = await commitRemediationFixture(root);
      const manifestPath =
        kind === "absolute" ? join(outside, "package-lock.json") : "../outside/package-lock.json";
      const work = await writeRemediationWorkItem(root, manifestPath);

      const child = runRemediation(root, work.path, revision, work.sha256);
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /repository-relative|outside|traversal/i);
      assert.equal(await readFile(join(outside, "package-lock.json"), "utf8"), before);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
}

test("remediation rejects backslash path ambiguity", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-remediation-backslash-")));
  const manifestPath = "nested\\package-lock.json";
  try {
    await writeRemediationManifest(root, manifestPath);
    const before = await readFile(join(root, manifestPath), "utf8");
    const revision = await commitRemediationFixture(root);
    const work = await writeRemediationWorkItem(root, manifestPath);

    const child = runRemediation(root, work.path, revision, work.sha256);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /backslash|canonical|repository-relative/i);
    assert.equal(await readFile(join(root, manifestPath), "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remediation rejects intermediate and final symbolic links", async () => {
  for (const linkKind of ["intermediate", "final"] as const) {
    const parent = await realpath(
      await mkdtemp(join(tmpdir(), `hulumi-sca-remediation-${linkKind}-link-`)),
    );
    const root = join(parent, "repo");
    const outside = join(parent, "outside");
    await mkdir(root);
    await mkdir(outside);
    try {
      await writeRemediationManifest(outside, "package-lock.json");
      const manifestPath = "linked/package-lock.json";
      if (linkKind === "intermediate") {
        await symlink(outside, join(root, "linked"));
      } else {
        await mkdir(join(root, "linked"));
        await symlink(join(outside, "package-lock.json"), join(root, manifestPath));
        await writeFile(
          join(root, "linked/package.json"),
          `${JSON.stringify({ dependencies: { lodash: "4.17.20" } }, null, 2)}\n`,
        );
      }
      const before = await readFile(join(outside, "package-lock.json"), "utf8");
      const revision = await commitRemediationFixture(root);
      const work = await writeRemediationWorkItem(root, manifestPath);

      const child = runRemediation(root, work.path, revision, work.sha256);
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, /symbolic link|regular file/i);
      assert.equal(await readFile(join(outside, "package-lock.json"), "utf8"), before);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  }
});

test("remediation rejects a non-regular manifest before opening it", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-remediation-fifo-")));
  try {
    await writeFile(join(root, "sentinel.txt"), "trusted checkout\n");
    const revision = await commitRemediationFixture(root);
    const fifo = spawnSync("mkfifo", [join(root, "package-lock.json")], { encoding: "utf8" });
    assert.equal(fifo.status, 0, fifo.stderr);
    const work = await writeRemediationWorkItem(root, "package-lock.json");

    const child = runRemediation(root, work.path, revision, work.sha256);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /regular file/i);
    assert.equal(await readFile(join(root, "sentinel.txt"), "utf8"), "trusted checkout\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const binding of ["revision", "digest"] as const) {
  test(`remediation rejects a mismatched reviewed ${binding} before mutation`, async () => {
    const root = await realpath(
      await mkdtemp(join(tmpdir(), `hulumi-sca-remediation-${binding}-`)),
    );
    try {
      await writeRemediationManifest(root, "package-lock.json");
      const before = await readFile(join(root, "package-lock.json"), "utf8");
      const revision = await commitRemediationFixture(root);
      const work = await writeRemediationWorkItem(root, "package-lock.json");
      const expectedRevision = binding === "revision" ? "0".repeat(40) : revision;
      const expectedDigest = binding === "digest" ? "f".repeat(64) : work.sha256;

      const child = runRemediation(root, work.path, expectedRevision, expectedDigest);
      assert.notEqual(child.status, 0);
      assert.match(child.stderr, binding === "revision" ? /revision|HEAD/i : /digest|SHA-256/i);
      assert.equal(await readFile(join(root, "package-lock.json"), "utf8"), before);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("remediation rejects duplicate evidence instead of selecting the first row", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-remediation-duplicate-")));
  try {
    await writeRemediationManifest(root, "package-lock.json");
    const before = await readFile(join(root, "package-lock.json"), "utf8");
    const revision = await commitRemediationFixture(root);
    const work = await writeRemediationWorkItem(root, "package-lock.json", (value) => {
      value.evidence = [...(value.evidence as unknown[]), ...(value.evidence as unknown[])];
    });

    const child = runRemediation(root, work.path, revision, work.sha256);
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /duplicate|exactly one|schema/i);
    assert.equal(await readFile(join(root, "package-lock.json"), "utf8"), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("remediation rejects a target replaced after its checked read", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-remediation-race-")));
  try {
    await writeRemediationManifest(root, "package-lock.json");
    const revision = await commitRemediationFixture(root);
    const work = await writeRemediationWorkItem(root, "package-lock.json");
    const replacement = `${JSON.stringify(packageLock("9.9.9"), null, 2)}\n`;

    await assert.rejects(
      remediateFromFiles({
        workItemsPath: work.path,
        outputPath: "remediation-result.json",
        applyPatch: true,
        repositoryRoot: root,
        expectedRevision: revision,
        workItemsSha256: work.sha256,
        beforeAtomicReplaceForTest: async (path) => {
          assert.equal(path, "package-lock.json");
          await writeFile(join(root, path), replacement);
        },
      }),
      /changed before atomic replacement/i,
    );
    assert.equal(await readFile(join(root, "package-lock.json"), "utf8"), replacement);
    assert.equal(
      JSON.parse(await readFile(join(root, "package.json"), "utf8")).dependencies.lodash,
      "4.17.20",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("bounded remediation refuses pnpm apply without invoking the package manager", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-remediation-pnpm-")));
  const bin = await realpath(await mkdtemp(join(tmpdir(), "hulumi-sca-remediation-bin-")));
  const marker = join(root, "pnpm-was-invoked");
  try {
    await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    const revision = await commitRemediationFixture(root);
    const work = await writeRemediationWorkItem(root, "pnpm-lock.yaml");
    const fakePnpm = join(bin, "pnpm");
    await writeFile(fakePnpm, `#!/bin/sh\ntouch '${marker}'\nexit 0\n`, { mode: 0o700 });
    await chmod(fakePnpm, 0o700);

    const child = runRemediation(root, work.path, revision, work.sha256, {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    });
    assert.notEqual(child.status, 0);
    assert.match(child.stderr, /pnpm|bounded|unsupported/i);
    await assert.rejects(access(marker));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(bin, { recursive: true, force: true });
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
