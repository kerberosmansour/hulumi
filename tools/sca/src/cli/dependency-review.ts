#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ensureScannerBinary, readScanConfig, type Finding } from "./scan";

const lockfileNames = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "requirements.txt",
  "packages.lock.json",
]);

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

export interface DependencyReviewResult {
  ok: boolean;
  changedLockfiles: string[];
  skippedFixtureLockfiles: string[];
  scannedRuntimeLockfiles: string[];
  blockingFindings: Finding[];
  error?: string;
}

export interface DependencyReviewOptions {
  rootDir?: string;
  changedFiles?: string[];
  fixtureLockfiles?: string[];
  scannerBin?: string;
  scanRuntimeLockfiles?: (lockfiles: string[]) => Promise<Finding[]>;
}

export async function reviewDependencyChanges(
  options: DependencyReviewOptions = {},
): Promise<DependencyReviewResult> {
  const rootDir = options.rootDir ?? process.cwd();
  const fixtureLockfiles = options.fixtureLockfiles ?? (await readFixtureLockfiles(rootDir));
  const changedFiles = options.changedFiles ?? (await changedFilesFromGit());
  const changedLockfiles = changedFiles.filter(isSupportedLockfile);
  const skippedFixtureLockfiles = changedLockfiles.filter((path) =>
    fixtureLockfiles.includes(path),
  );
  const runtimeLockfiles = changedLockfiles.filter((path) => !fixtureLockfiles.includes(path));

  if (runtimeLockfiles.length === 0) {
    return {
      ok: true,
      changedLockfiles,
      skippedFixtureLockfiles,
      scannedRuntimeLockfiles: [],
      blockingFindings: [],
    };
  }

  try {
    const currentFindings = await (
      options.scanRuntimeLockfiles ??
      ((lockfiles) => scanRuntimeLockfiles(rootDir, lockfiles, options.scannerBin))
    )(runtimeLockfiles);
    const baselineFindings =
      options.scanRuntimeLockfiles === undefined
        ? await scanBaseRuntimeLockfiles(rootDir, runtimeLockfiles, options.scannerBin)
        : [];
    const baselineKeys = new Set(baselineFindings.map(findingIdentity));
    const blockingFindings = currentFindings.filter(
      (finding) => !baselineKeys.has(findingIdentity(finding)),
    );
    return {
      ok: blockingFindings.length === 0,
      changedLockfiles,
      skippedFixtureLockfiles,
      scannedRuntimeLockfiles: runtimeLockfiles,
      blockingFindings,
    };
  } catch (error) {
    return {
      ok: false,
      changedLockfiles,
      skippedFixtureLockfiles,
      scannedRuntimeLockfiles: runtimeLockfiles,
      blockingFindings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function scanBaseRuntimeLockfiles(rootDir: string, lockfiles: string[], scannerBin?: string) {
  const base = await resolveBaseRef();
  const baseRoot = join(rootDir, ".cache/dependency-review-base");
  await rm(baseRoot, { force: true, recursive: true });
  const baseLockfiles: string[] = [];

  for (const path of lockfiles) {
    const result = await runProcess("git", ["show", `${base}:${path}`], rootDir);
    if (result.code !== 0) {
      continue;
    }
    const basePath = join(".cache/dependency-review-base", path);
    await mkdir(dirname(join(rootDir, basePath)), { recursive: true });
    await writeFile(join(rootDir, basePath), result.stdout);
    baseLockfiles.push(basePath);
  }

  if (baseLockfiles.length === 0) {
    return [];
  }
  return scanRuntimeLockfiles(rootDir, baseLockfiles, scannerBin);
}

function findingIdentity(finding: Finding) {
  return `${finding.ecosystem}:${finding.package}@${finding.version}:${finding.advisoryId}`;
}

async function readFixtureLockfiles(rootDir: string) {
  return (await readScanConfig(rootDir))
    .filter((entry) => entry.fixture)
    .map((entry) => entry.path);
}

async function scanRuntimeLockfiles(rootDir: string, lockfiles: string[], scannerBin?: string) {
  const scanner = scannerBin ?? (await ensureScannerBinary(rootDir));
  const outputPath = join(rootDir, ".cache/dependency-review-osv.json");
  const configPath = join(rootDir, ".cache/dependency-review-osv.toml");
  await mkdir(dirname(outputPath), { recursive: true });
  await rm(outputPath, { force: true });
  await writeFile(configPath, "");

  const result = await runProcess(
    scanner,
    [
      "scan",
      "source",
      ...lockfiles.flatMap((path) => [`--lockfile=${scannerLockfileArg(path)}`]),
      `--config=${configPath}`,
      "--format=json",
      `--output-file=${outputPath}`,
    ],
    rootDir,
  );
  const output = await readOsvOutput(outputPath, result.stderr, result.code);
  const parsed = osvOutputSchema.safeParse(JSON.parse(output));
  if (!parsed.success) {
    throw new Error(`OSV scanner JSON failed schema validation: ${parsed.error.message}`);
  }
  if (
    result.code !== 0 &&
    parsed.data.results.length === 0 &&
    !isNoPackageSourcesResult(result.stderr)
  ) {
    throw new Error(`OSV scanner failed before producing findings: ${result.stderr.trim()}`);
  }
  return flattenOsvResults(rootDir, parsed.data);
}

export function isNoPackageSourcesResult(stderr: string) {
  return /No package sources found/i.test(stderr);
}

async function readOsvOutput(outputPath: string, stderr: string, exitCode: number) {
  try {
    return await readFile(outputPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error) && exitCode !== 0 && isNoPackageSourcesResult(stderr)) {
      return JSON.stringify({ results: [] });
    }
    throw error;
  }
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
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

function scannerLockfileArg(path: string) {
  if (path.endsWith("requirements.txt")) {
    return `requirements.txt:${path}`;
  }
  return path;
}

function isSupportedLockfile(path: string) {
  return lockfileNames.has(path.split("/").at(-1) ?? "");
}

async function changedFilesFromGit() {
  if (process.env.SCA_DEP_REVIEW_CHANGED_FILES) {
    return process.env.SCA_DEP_REVIEW_CHANGED_FILES.split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  const base = await resolveBaseRef();
  const mergeBase = (
    await runProcess("git", ["merge-base", base, "HEAD"], process.cwd())
  ).stdout.trim();
  if (!mergeBase) {
    throw new Error(`could not resolve merge-base for ${base}`);
  }
  return (await runProcess("git", ["diff", "--name-only", mergeBase, "HEAD"], process.cwd())).stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

async function resolveBaseRef() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    const parsed = JSON.parse(await readFile(eventPath, "utf8")) as {
      pull_request?: { base?: { sha?: string } };
    };
    if (parsed.pull_request?.base?.sha) {
      return parsed.pull_request.base.sha;
    }
  }
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }
  return "origin/main";
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

export async function main() {
  const result = await reviewDependencyChanges();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

const entrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (entrypoint) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
