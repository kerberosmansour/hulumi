#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { scopeFileSchema } from "../scope/policy";

const OSV_VERSION = "v2.7.0";
const OSV_COMMIT = "bfe2f84abd2f09fe0b83ba7f6dad40d296762f40";
const OSV_RELEASE_BASE = `https://github.com/google/osv-scanner/releases/download/${OSV_VERSION}`;
const MAX_SCANNER_BYTES = 64 * 1024 * 1024;

const scannerAssets = {
  "darwin-arm64": {
    name: "osv-scanner_darwin_arm64",
    sha256: "d4926ef8da134332543be276dff157e4c170f99ad91fc48e89448a8816bdf70b",
  },
  "darwin-x64": {
    name: "osv-scanner_darwin_amd64",
    sha256: "e82c5df7ab0a42dff29a1cd0660711447b56b4c0483ff66ad8634df10fd81a45",
  },
  "linux-arm64": {
    name: "osv-scanner_linux_arm64",
    sha256: "4061ef4c021ed3c47f203b818f337e351336cc5cd67c0274fc36bd1dfc728dd7",
  },
  "linux-x64": {
    name: "osv-scanner_linux_amd64",
    sha256: "160c6253e2922e9e0a6a9771c5c4c40a4b3c6090b34a3cdd5e80c96cc2e4218b",
  },
  "win32-arm64": {
    name: "osv-scanner_windows_arm64.exe",
    sha256: "3e630381c1f1fd3c9c4d447e6ff2ef6c737083371722773db8337eead0f97962",
  },
  "win32-x64": {
    name: "osv-scanner_windows_amd64.exe",
    sha256: "9964ed64ec9a387391eb4cc006ad5c531154821aef29b793e02c448de4686438",
  },
} as const;

const lockfileSchema = z.object({
  ecosystem: z.enum(["npm", "PyPI", "NuGet"]),
  path: z.string().min(1),
  parser: z.string().min(1),
  package: z.string().min(1),
  badVersion: z.string().min(1),
  knownAdvisory: z.string().min(1),
  fixture: z.boolean().optional().default(false),
});

const findingSchema = z.object({
  ecosystem: z.enum(["npm", "PyPI", "NuGet"]),
  package: z.string().min(1),
  version: z.string().min(1),
  advisoryId: z.string().min(1),
  manifestPath: z.string().min(1),
});

const scanResultSchema = z.object({
  generatedAt: z.string().datetime(),
  scanner: z.object({
    mode: z.string(),
    version: z.string(),
    commit: z.string(),
  }),
  findings: z.array(findingSchema),
});

const osvPackageSchema = z
  .object({
    package: z
      .object({
        name: z.string(),
        ecosystem: z.string(),
        version: z.string().optional(),
      })
      .passthrough(),
    vulnerabilities: z
      .array(z.object({ id: z.string() }).passthrough())
      .optional()
      .default([]),
  })
  .passthrough();

const osvOutputSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            source: z
              .object({
                path: z.string().optional(),
                type: z.string().optional(),
              })
              .passthrough(),
            packages: z.array(osvPackageSchema).optional().default([]),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

const defaultLockfiles = [
  {
    ecosystem: "npm",
    path: "apps/web-npm/package-lock.json",
    parser: "package-lock.json",
    package: "lodash",
    badVersion: "4.17.20",
    knownAdvisory: "GHSA-35jh-r3h4-6jhm",
    fixture: true,
  },
  {
    ecosystem: "PyPI",
    path: "services/api-py/requirements.txt",
    parser: "requirements.txt",
    package: "django",
    badVersion: "1.2",
    knownAdvisory: "PYSEC-2010-12",
    fixture: true,
  },
  {
    ecosystem: "NuGet",
    path: "services/worker-dotnet/packages.lock.json",
    parser: "packages.lock.json",
    package: "Newtonsoft.Json",
    badVersion: "12.0.1",
    knownAdvisory: "GHSA-5crp-9r3c-p9vr",
    fixture: true,
  },
] satisfies LockfileConfig[];

const fixtureAdvisories = new Map<string, string[]>([
  ["npm:lodash@4.17.20", ["GHSA-35jh-r3h4-6jhm"]],
  ["PyPI:django@1.2", ["PYSEC-2010-12"]],
  ["NuGet:Newtonsoft.Json@12.0.1", ["GHSA-5crp-9r3c-p9vr"]],
]);

export type LockfileConfig = z.infer<typeof lockfileSchema>;

// Minimal shape the OSV scanner actually needs. `LockfileConfig` (fixture-shaped,
// from osv-scanner.toml) is assignable to this; scope-derived entries supply only
// ecosystem/path/parser. This lets the scope file drive real scanning without the
// fixture-only fields.
export interface ScanLockfile {
  ecosystem: string;
  path: string;
  parser: string;
  package?: string;
  badVersion?: string;
}
export type Finding = z.infer<typeof findingSchema>;
type ScanResult = z.infer<typeof scanResultSchema>;
type ScannerMode = "osv" | "fixture" | "unavailable";

interface ScanOptions {
  rootDir?: string;
  outputPath?: string;
  scannerMode?: ScannerMode;
  scannerBin?: string;
  // Opt-in: derive the scan list from sca-scope.json (entries whose track is not
  // "ignore") instead of osv-scanner.toml. Default false preserves existing behavior.
  useScope?: boolean;
  scopePath?: string;
}

interface GuardOptions {
  rootDir?: string;
}

export async function scanProject(options: ScanOptions = {}): Promise<ScanResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const outputPath = options.outputPath ?? join(rootDir, "findings.osv.json");
  const mode = resolveScannerMode(options.scannerMode);
  const lockfiles: ScanLockfile[] = options.useScope
    ? await readScopeScanList(rootDir, options.scopePath)
    : await readScanConfig(rootDir);

  await validateLockfiles(rootDir, lockfiles);

  if (mode === "unavailable") {
    throw new Error("OSV database unavailable: scanner could not reach the vulnerability database");
  }

  const findings =
    mode === "fixture"
      ? await scanWithFixtureDatabase(rootDir, lockfiles)
      : await scanWithOsvScanner(rootDir, lockfiles, options.scannerBin);

  const result = scanResultSchema.parse({
    generatedAt: new Date().toISOString(),
    scanner: {
      mode,
      version: OSV_VERSION,
      commit: OSV_COMMIT,
    },
    findings,
  });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export async function verifyFixturesNotInstalled(options: GuardOptions = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const lockfiles = await readScanConfig(rootDir);
  const violations: Array<{
    ecosystem: string;
    package: string;
    version: string;
    path: string;
  }> = [];

  for (const entry of lockfiles) {
    if (entry.ecosystem === "npm") {
      const packageJsonPath = join(
        rootDir,
        dirname(entry.path),
        "node_modules",
        entry.package,
        "package.json",
      );
      const installedVersion = await readJsonVersion(packageJsonPath);
      if (installedVersion === entry.badVersion) {
        violations.push({
          ecosystem: entry.ecosystem,
          package: entry.package,
          version: entry.badVersion,
          path: relative(rootDir, packageJsonPath),
        });
      }
    }

    if (entry.ecosystem === "PyPI") {
      const venvPath = join(rootDir, dirname(entry.path), ".venv");
      if (await exists(venvPath)) {
        violations.push({
          ecosystem: entry.ecosystem,
          package: entry.package,
          version: entry.badVersion,
          path: relative(rootDir, venvPath),
        });
      }
    }

    if (entry.ecosystem === "NuGet") {
      const assetsPath = join(rootDir, dirname(entry.path), "obj/project.assets.json");
      const assets = await readTextIfExists(assetsPath);
      if (assets?.includes(entry.package) && assets.includes(entry.badVersion)) {
        violations.push({
          ecosystem: entry.ecosystem,
          package: entry.package,
          version: entry.badVersion,
          path: relative(rootDir, assetsPath),
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    checked: lockfiles.map((entry) => ({
      ecosystem: entry.ecosystem,
      package: entry.package,
      badVersion: entry.badVersion,
      manifestPath: entry.path,
    })),
    violations,
  };
}

export async function readScanConfig(rootDir: string): Promise<LockfileConfig[]> {
  const configPath = join(rootDir, "osv-scanner.toml");
  const config = await readTextIfExists(configPath);
  if (config === undefined) {
    return defaultLockfiles;
  }

  const entries = config
    .split("[[sca_lockfile]]")
    .slice(1)
    .map((block) => {
      const values = new Map<string, string>();
      for (const line of block.split(/\r?\n/)) {
        const stringMatch = line.match(/^\s*([A-Za-z]+)\s*=\s*"([^"]+)"\s*$/);
        if (stringMatch) {
          values.set(stringMatch[1], stringMatch[2]);
          continue;
        }
        const boolMatch = line.match(/^\s*([A-Za-z]+)\s*=\s*(true|false)\s*$/);
        if (boolMatch) {
          values.set(boolMatch[1], boolMatch[2]);
        }
      }
      const raw = Object.fromEntries(values);
      return lockfileSchema.parse({
        ...raw,
        fixture: raw.fixture === "true",
      });
    });

  return entries.length > 0 ? entries : defaultLockfiles;
}

export async function readScopeScanList(
  rootDir: string,
  scopePath?: string,
): Promise<ScanLockfile[]> {
  const path = scopePath ?? join(rootDir, "sca-scope.json");
  const raw = await readTextIfExists(path);
  if (raw === undefined) {
    // No silent fallback: --from-scope explicitly opted into scope-driven scanning.
    throw new Error(`--from-scope requires ${path}, but it does not exist`);
  }
  const scope = scopeFileSchema.parse(JSON.parse(raw));
  return scope.manifests
    .filter((entry) => entry.track !== "ignore")
    .map((entry) => ({
      ecosystem: entry.ecosystem,
      path: entry.path,
      parser: entry.parser,
    }));
}

async function validateLockfiles(rootDir: string, lockfiles: ScanLockfile[]) {
  for (const entry of lockfiles) {
    const absolutePath = join(rootDir, entry.path);
    try {
      const contents = await readFile(absolutePath, "utf8");
      if (entry.parser === "package-lock.json" || entry.parser === "packages.lock.json") {
        JSON.parse(contents);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`malformed lockfile: ${entry.path}: ${reason}`, { cause: error });
    }
  }
}

async function scanWithFixtureDatabase(
  rootDir: string,
  lockfiles: ScanLockfile[],
): Promise<Finding[]> {
  const findings: Finding[] = [];

  for (const entry of lockfiles) {
    const ecosystem = normalizeEcosystem(entry.ecosystem);
    if (ecosystem === undefined || entry.package === undefined) {
      continue;
    }
    const version = await readPinnedVersion(rootDir, entry);
    const advisoryIds =
      fixtureAdvisories.get(`${entry.ecosystem}:${entry.package}@${version}`) ?? [];
    for (const advisoryId of advisoryIds) {
      findings.push({
        ecosystem,
        package: entry.package,
        version,
        advisoryId,
        manifestPath: entry.path,
      });
    }
  }

  return findings;
}

async function scanWithOsvScanner(
  rootDir: string,
  lockfiles: ScanLockfile[],
  requestedScannerBin?: string,
): Promise<Finding[]> {
  const scannerBin = requestedScannerBin ?? (await ensureScannerBinary(rootDir));
  const rawOutputPath = join(rootDir, ".cache/osv-raw.json");
  await mkdir(dirname(rawOutputPath), { recursive: true });

  const args = [
    "scan",
    "source",
    ...lockfiles.flatMap((entry) => [`--lockfile=${scannerLockfileArg(entry)}`]),
    "--format=json",
    `--output-file=${rawOutputPath}`,
  ];
  const result = await runProcess(scannerBin, args, rootDir);
  const rawOutput = await readTextIfExists(rawOutputPath);
  if (rawOutput === undefined) {
    throw new Error(
      `OSV database unavailable or scanner failed before writing JSON: ${result.stderr.trim()}`,
    );
  }

  const parsed = osvOutputSchema.safeParse(JSON.parse(rawOutput));
  if (!parsed.success) {
    throw new Error(`OSV scanner JSON failed schema validation: ${parsed.error.message}`);
  }

  const findings = flattenOsvResults(rootDir, parsed.data);
  if (result.code !== 0 && findings.length === 0) {
    throw new Error(`OSV database unavailable or scan failed: ${result.stderr.trim()}`);
  }

  return findings;
}

function scannerLockfileArg(entry: ScanLockfile) {
  if (entry.parser === "requirements.txt") {
    return `requirements.txt:${entry.path}`;
  }
  return entry.path;
}

function flattenOsvResults(rootDir: string, output: z.infer<typeof osvOutputSchema>): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();

  for (const result of output.results) {
    const sourcePath = result.source.path ? relative(rootDir, result.source.path) : "unknown";
    for (const pkg of result.packages) {
      const ecosystem = normalizeEcosystem(pkg.package.ecosystem);
      if (ecosystem === undefined || pkg.package.version === undefined) {
        continue;
      }
      for (const vulnerability of pkg.vulnerabilities) {
        const finding = {
          ecosystem,
          package: pkg.package.name,
          version: pkg.package.version,
          advisoryId: vulnerability.id,
          manifestPath: sourcePath,
        };
        const key = `${finding.ecosystem}:${finding.package}@${finding.version}:${finding.advisoryId}:${finding.manifestPath}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push(finding);
        }
      }
    }
  }

  return findings;
}

function normalizeEcosystem(ecosystem: string): Finding["ecosystem"] | undefined {
  if (ecosystem === "npm") {
    return "npm";
  }
  if (ecosystem === "PyPI") {
    return "PyPI";
  }
  if (ecosystem === "NuGet") {
    return "NuGet";
  }
  return undefined;
}

async function readPinnedVersion(rootDir: string, entry: ScanLockfile): Promise<string> {
  const packageName = entry.package;
  if (!packageName) {
    return "";
  }
  const contents = await readFile(join(rootDir, entry.path), "utf8");

  if (entry.parser === "requirements.txt") {
    const line = contents
      .split(/\r?\n/)
      .map((candidate) => candidate.trim())
      .find((candidate) => candidate.toLowerCase().startsWith(`${packageName.toLowerCase()}==`));
    return line?.split("==")[1] ?? "";
  }

  const parsed = JSON.parse(contents) as unknown;
  if (entry.parser === "package-lock.json") {
    const root = z
      .object({
        packages: z.record(z.string(), z.object({ version: z.string().optional() }).passthrough()),
      })
      .passthrough()
      .parse(parsed);
    return root.packages[`node_modules/${packageName}`]?.version ?? "";
  }

  const root = z
    .object({
      dependencies: z.record(
        z.string(),
        z.record(z.string(), z.object({ resolved: z.string().optional() }).passthrough()),
      ),
    })
    .passthrough()
    .parse(parsed);

  for (const framework of Object.values(root.dependencies)) {
    const packageRecord = framework[packageName];
    if (packageRecord?.resolved) {
      return packageRecord.resolved;
    }
  }
  return "";
}

export async function ensureScannerBinary(rootDir: string): Promise<string> {
  const assetKey = `${process.platform}-${process.arch}` as keyof typeof scannerAssets;
  const asset = scannerAssets[assetKey];
  if (asset === undefined) {
    throw new Error(`unsupported OSV-Scanner platform: ${assetKey}`);
  }

  const configuredBinary = process.env.OSV_SCANNER_BIN?.trim();
  if (configuredBinary) {
    if (!isAbsolute(configuredBinary)) {
      throw new Error("OSV_SCANNER_BIN must be an absolute path to the pinned OSV-Scanner asset");
    }
    return await verifyScannerBinary(configuredBinary, asset.sha256, rootDir);
  }

  const configuredCache = process.env.HULUMI_SCA_CACHE_DIR?.trim();
  const cacheRoot = configuredCache || join(homedir(), ".cache", "hulumi", "osv-scanner");
  if (!isAbsolute(cacheRoot)) {
    throw new Error("HULUMI_SCA_CACHE_DIR must be an absolute path outside the scanned repository");
  }
  await assertOutsideRepository(cacheRoot, rootDir, "OSV scanner cache root");

  const versionDirectory = join(cacheRoot, OSV_VERSION);
  await ensurePrivateCacheDirectory(cacheRoot);
  await ensurePrivateCacheDirectory(versionDirectory);
  await assertOutsideRepository(await realpath(cacheRoot), rootDir, "OSV scanner cache root");

  const destination = join(versionDirectory, asset.name);
  if (await pathExistsWithoutFollowingLinks(destination)) {
    return await verifyScannerBinary(destination, asset.sha256, rootDir, cacheRoot);
  }

  const response = await fetch(`${OSV_RELEASE_BASE}/${asset.name}`);
  if (!response.ok) {
    throw new Error(`failed to download OSV-Scanner ${OSV_VERSION}: HTTP ${response.status}`);
  }
  if (new URL(response.url).protocol !== "https:") {
    throw new Error(`refusing non-HTTPS OSV-Scanner response for ${OSV_VERSION}`);
  }
  const responseHost = new URL(response.url).hostname;
  if (responseHost !== "github.com" && !responseHost.endsWith(".githubusercontent.com")) {
    throw new Error(`refusing unexpected OSV-Scanner download host: ${responseHost}`);
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new Error("OSV-Scanner asset returned an invalid Content-Length");
    }
    if (parsedLength > MAX_SCANNER_BYTES) {
      throw new Error(`OSV-Scanner asset exceeds ${MAX_SCANNER_BYTES} byte limit`);
    }
  }
  const bytes = await readBoundedResponse(response, MAX_SCANNER_BYTES);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== asset.sha256) {
    throw new Error(`OSV-Scanner SHA-256 mismatch: expected ${asset.sha256}, got ${digest}`);
  }

  const stagingDirectory = await mkdtemp(join(versionDirectory, ".download-"));
  const staged = join(stagingDirectory, asset.name);
  try {
    await chmod(stagingDirectory, 0o700);
    await writeFile(staged, bytes, { flag: "wx", mode: 0o700 });
    await chmod(staged, 0o700);
    await verifyScannerBinary(staged, asset.sha256, rootDir, cacheRoot);

    if (await pathExistsWithoutFollowingLinks(destination)) {
      throw new Error("OSV-Scanner cache destination appeared during download; refusing overwrite");
    }
    await rename(staged, destination);
    await chmod(destination, 0o700);
    return await verifyScannerBinary(destination, asset.sha256, rootDir, cacheRoot);
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

export async function verifyScannerBinary(
  candidate: string,
  expectedSha256: string,
  rootDir: string,
  trustedCacheRoot?: string,
): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new Error("OSV-Scanner expected SHA-256 must be 64 lowercase hexadecimal characters");
  }
  if (!isAbsolute(candidate)) {
    throw new Error("OSV-Scanner binary must be an absolute path");
  }
  const absoluteCandidate = resolve(candidate);
  await assertOutsideRepository(absoluteCandidate, rootDir, "OSV-Scanner binary");
  await assertNoSymlinkComponents(absoluteCandidate);

  const canonicalCandidate = await realpath(absoluteCandidate);
  await assertOutsideRepository(canonicalCandidate, rootDir, "OSV-Scanner binary");
  if (trustedCacheRoot !== undefined) {
    const canonicalCache = await realpath(trustedCacheRoot);
    if (!isPathWithin(canonicalCache, canonicalCandidate)) {
      throw new Error("OSV-Scanner cache binary escaped its trusted cache root");
    }
  }

  const noFollow = "O_NOFOLLOW" in constants ? constants.O_NOFOLLOW : 0;
  const handle = await open(canonicalCandidate, constants.O_RDONLY | noFollow);
  try {
    const before = await handle.stat();
    if (!before.isFile()) {
      throw new Error("OSV-Scanner integrity check requires a regular file");
    }
    if (before.size <= 0 || before.size > MAX_SCANNER_BYTES) {
      throw new Error(`OSV-Scanner integrity check rejected size ${before.size}`);
    }
    if (typeof process.getuid === "function" && before.uid !== process.getuid()) {
      throw new Error("OSV-Scanner integrity check rejected a file owned by another user");
    }
    if (process.platform !== "win32") {
      if ((before.mode & 0o111) === 0) {
        throw new Error("OSV-Scanner integrity check requires an executable file");
      }
      if ((before.mode & 0o022) !== 0) {
        throw new Error("OSV-Scanner integrity check rejected group/world-writable permissions");
      }
    }

    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < before.size) {
      const { bytesRead } = await handle.read(bytes, offset, before.size - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const trailing = Buffer.alloc(1);
    const { bytesRead: trailingBytes } = await handle.read(trailing, 0, 1, before.size);
    const after = await handle.stat();
    if (offset !== before.size || trailingBytes !== 0 || after.size !== before.size) {
      throw new Error("OSV-Scanner integrity check detected a concurrent file change");
    }
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== expectedSha256) {
      throw new Error(
        `OSV-Scanner checksum integrity mismatch: expected ${expectedSha256}, got ${digest}`,
      );
    }
  } finally {
    await handle.close();
  }
  return canonicalCandidate;
}

async function ensurePrivateCacheDirectory(directory: string): Promise<void> {
  await assertExistingComponentsAreNotSymlinks(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await assertNoSymlinkComponents(directory);
  const metadata = await lstat(directory);
  if (!metadata.isDirectory()) {
    throw new Error("OSV-Scanner cache path is not a directory");
  }
  if (typeof process.getuid === "function" && metadata.uid !== process.getuid()) {
    throw new Error("OSV-Scanner cache directory is owned by another user");
  }
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error("OSV-Scanner cache directory must not grant group or world access");
  }
}

async function assertExistingComponentsAreNotSymlinks(path: string): Promise<void> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components = relative(root, absolute).split(sep).filter(Boolean);
  let cursor = root;
  for (const component of components) {
    cursor = join(cursor, component);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink()) {
        throw new Error(`OSV-Scanner path contains a symbolic link: ${cursor}`);
      }
    } catch (error) {
      if (isMissingFileError(error)) return;
      throw error;
    }
  }
}

async function assertNoSymlinkComponents(path: string): Promise<void> {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components = relative(root, absolute).split(sep).filter(Boolean);
  let cursor = root;
  for (const component of components) {
    cursor = join(cursor, component);
    const metadata = await lstat(cursor);
    if (metadata.isSymbolicLink()) {
      throw new Error(`OSV-Scanner path contains a symbolic link: ${cursor}`);
    }
  }
}

async function assertOutsideRepository(
  candidate: string,
  rootDir: string,
  label: string,
): Promise<void> {
  const absoluteRoot = resolve(rootDir);
  const canonicalRoot = await realpath(absoluteRoot);
  const absoluteCandidate = resolve(candidate);
  if (
    isPathWithin(absoluteRoot, absoluteCandidate) ||
    isPathWithin(canonicalRoot, absoluteCandidate)
  ) {
    throw new Error(`${label} must be outside the scanned repository`);
  }
}

function isPathWithin(parent: string, child: string): boolean {
  const relation = relative(parent, child);
  return (
    relation === "" ||
    (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation))
  );
}

async function pathExistsWithoutFollowingLinks(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }
    throw error;
  }
}

async function readBoundedResponse(response: Response, maximumBytes: number): Promise<Buffer> {
  if (response.body === null) {
    throw new Error("OSV-Scanner download returned an empty response body");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new Error(`OSV-Scanner asset exceeds ${maximumBytes} byte limit`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}

async function runProcess(command: string, args: string[], cwd: string) {
  return await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function readJsonVersion(path: string): Promise<string | undefined> {
  const contents = await readTextIfExists(path);
  if (contents === undefined) {
    return undefined;
  }
  return z.object({ version: z.string() }).passthrough().parse(JSON.parse(contents)).version;
}

async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isMissingFileError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function resolveScannerMode(mode?: ScannerMode): ScannerMode {
  if (mode) {
    return mode;
  }
  if (
    process.env.SCA_SCANNER_MODE === "fixture" ||
    process.env.SCA_SCANNER_MODE === "unavailable"
  ) {
    return process.env.SCA_SCANNER_MODE;
  }
  return process.env.NODE_ENV === "test" ? "fixture" : "osv";
}

function parseArgs(argv: string[]) {
  const [command = "scan", ...rest] = argv;
  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token.startsWith("--")) {
      const [key, inlineValue] = token.slice(2).split("=", 2);
      const value = inlineValue ?? rest[index + 1];
      if (inlineValue === undefined) {
        index += 1;
      }
      options.set(key, value);
    }
  }
  return { command, options };
}

export async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (command === "scan") {
    const result = await scanProject({
      outputPath: options.get("output"),
      scannerMode: options.get("scanner") as ScannerMode | undefined,
      useScope: options.get("from-scope") === "true",
    });
    process.stdout.write(
      `sca scan completed: ${result.findings.length} finding(s), output=${options.get("output") ?? "findings.osv.json"}\n`,
    );
    return;
  }

  if (command === "verify-fixtures-not-installed") {
    const result = await verifyFixturesNotInstalled();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error(`unknown command: ${command}`);
}

const entrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (entrypoint) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
