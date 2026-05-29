#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { scopeFileSchema } from "../scope/policy";

const OSV_VERSION = "v2.3.8";
const OSV_COMMIT = "408fcd6f8707999a29e7ba45e15809764cf24f67";
const OSV_RELEASE_BASE = `https://github.com/google/osv-scanner/releases/download/${OSV_VERSION}`;

const scannerAssets = {
  "darwin-arm64": {
    name: "osv-scanner_darwin_arm64",
    sha256: "a8cd6507b06239f463a7642430cfd2d154882f150f6e30cdc0653e28dfc34216",
  },
  "darwin-x64": {
    name: "osv-scanner_darwin_amd64",
    sha256: "b8a80a9f14ca4c0cd0fc2d351b28f740da9e6a5b18385ac9f9d083360b5b504e",
  },
  "linux-arm64": {
    name: "osv-scanner_linux_arm64",
    sha256: "8158b18edd2d03b1a30d905ca91b032bc62262167be8f206c27114f08823e27c",
  },
  "linux-x64": {
    name: "osv-scanner_linux_amd64",
    sha256: "bc98e15319ed0d515e3f9235287ba53cdc5535d576d24fd573978ecfe9ab92dc",
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
      throw new Error(`malformed lockfile: ${entry.path}: ${reason}`);
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
  if (process.env.OSV_SCANNER_BIN) {
    return process.env.OSV_SCANNER_BIN;
  }

  if (await commandWorks("osv-scanner")) {
    return "osv-scanner";
  }

  const assetKey = `${process.platform}-${process.arch}` as keyof typeof scannerAssets;
  const asset = scannerAssets[assetKey];
  if (asset === undefined) {
    throw new Error(`unsupported OSV-Scanner platform: ${assetKey}`);
  }

  const destination = join(rootDir, ".cache/osv-scanner", OSV_VERSION, asset.name);
  if (await exists(destination)) {
    return destination;
  }

  const response = await fetch(`${OSV_RELEASE_BASE}/${asset.name}`);
  if (!response.ok) {
    throw new Error(`failed to download OSV-Scanner ${OSV_VERSION}: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== asset.sha256) {
    throw new Error(`OSV-Scanner SHA-256 mismatch: expected ${asset.sha256}, got ${digest}`);
  }

  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  await chmod(destination, 0o755);
  return destination;
}

async function commandWorks(command: string): Promise<boolean> {
  try {
    const result = await runProcess(command, ["--version"], process.cwd());
    return result.code === 0;
  } catch {
    return false;
  }
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
