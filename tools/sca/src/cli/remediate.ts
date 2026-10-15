#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants, type BigIntStats } from "node:fs";
import { lstat, open, readFile, realpath, rename, unlink } from "node:fs/promises";
import { isAbsolute, dirname, join, posix, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  agentRequestSchema,
  runAgentReview,
  type AgentBackend,
  type AgentRequest,
  type AgentResponse,
} from "../agents/adapter";
import { createClaudeBackend } from "../agents/claude";
import type { NormalizedEvidence } from "../evidence/normalize";

const execFileAsync = promisify(execFile);
const noFollowFlag = fsConstants.O_NOFOLLOW ?? 0;

const normalizedEvidenceSchema = z
  .object({
    findingKey: z.string().min(1),
    osv: z
      .object({
        advisoryId: z.string().min(1),
        class: z.enum(["malicious", "critical"]),
        fixedVersion: z.string().min(1).nullable(),
      })
      .strict(),
    dependencyReview: z
      .object({ present: z.boolean(), vulnerableTransitives: z.array(z.string().min(1)) })
      .strict(),
    ghsa: z.object({ id: z.string().min(1).nullable(), cvss: z.number().nullable() }).strict(),
    kev: z.object({ listed: z.boolean().nullable() }).strict(),
    epss: z.object({ score: z.number().nullable(), available: z.boolean() }).strict(),
    registry: z.object({ publishedAt: z.string().nullable() }).strict(),
    provenance: z
      .object({
        osv: z.enum(["ok", "unavailable"]),
        dependencyReview: z.enum(["ok", "unavailable"]),
        ghsa: z.enum(["ok", "unavailable"]),
        kev: z.enum(["ok", "unavailable"]),
        epss: z.enum(["ok", "unavailable"]),
        registry: z.enum(["ok", "unavailable"]),
      })
      .strict(),
    manifestPaths: z.array(z.string().min(1)).min(1),
    raw: z
      .object({
        ecosystem: z.enum(["npm", "PyPI", "NuGet"]),
        package: z.string().min(1),
        version: z.string().min(1),
        advisoryId: z.string().min(1),
        manifestPath: z.string().min(1),
      })
      .strict(),
  })
  .strict();

const workItemsFileSchema = z
  .object({
    version: z.literal(1),
    workItems: z.array(
      z
        .object({
          findingKey: z.string().min(1),
          track: z.enum(["emergency", "cadence", "dropped"]),
          state: z.enum(["in_progress", "detected", "escalated", "remediated", "dropped"]),
          reason: z.string().min(1).optional(),
        })
        .strict(),
    ),
    evidence: z.array(normalizedEvidenceSchema).optional(),
  })
  .strict();

export interface EmergencyWorkItem {
  findingKey: string;
  track: "emergency";
  state: "in_progress" | "detected" | "escalated" | "remediated" | "dropped";
  packageName: string;
  ecosystem: "npm" | "PyPI" | "NuGet";
  fromVersion: string;
  fixedVersion: string;
  manifestPaths: string[];
}

export interface RemediationResult {
  pr: {
    opened: boolean;
    merged: boolean;
    labels: string[];
    changedFiles: string[];
    approved: boolean;
  };
  verdict: AgentResponse;
  checks: Record<string, "success" | "failure" | "skipped">;
  events: Array<{ name: string; iteration?: number; decision?: string }>;
  escalated: boolean;
  blockedReason?: string;
  agentRequest?: AgentRequest;
  availableAgentTools: string[];
  testsIntact: boolean;
  changedPackages: string[];
  releasePublished: boolean;
}

export interface RemediationOptions {
  sideEffectsAllowed: boolean;
  agentBackend: AgentBackend;
  allowedPaths: string[];
  dependencyClosure?: string[];
  maliciousPackages?: string[];
  dependencyReviewPass?: boolean;
  ciInitiallyGreen?: boolean;
  fixerAttempts?: Array<{
    path?: string;
    action?: "modify" | "delete" | "command";
    command?: string;
  }>;
  reviewerFixAttempts?: Array<{
    path?: string;
    action?: "modify" | "delete" | "command";
    command?: string;
  }>;
  requestedChanges?: Array<{
    packageName: string;
    from: string;
    to: string;
  }>;
  maxIterations?: number;
  advisoryText?: string;
  changelogText?: string;
  agentTimeoutMs?: number;
}

export async function remediateEmergency(
  workItem: EmergencyWorkItem,
  options: RemediationOptions,
): Promise<RemediationResult> {
  const maxIterations = options.maxIterations ?? 3;
  const dependencyClosure = options.dependencyClosure ?? [
    `${workItem.packageName}@${workItem.fixedVersion}`,
  ];
  const availableAgentTools = options.agentBackend.allowedTools ?? [
    "read_diff",
    "submit_structured_verdict",
  ];
  const result: RemediationResult = {
    pr: {
      opened: true,
      merged: false,
      labels: ["security-emergency"],
      changedFiles: [...options.allowedPaths],
      approved: false,
    },
    verdict: {
      decision: "escalate",
      rationale: "not reviewed yet",
      malwareRecheck: "unknown",
      checkedDependencyClosure: dependencyClosure,
    },
    checks: {
      build: "success",
      test: "success",
      sast: "success",
      "fixtures-not-installed": "success",
      "release-reviewer-verdict": "skipped",
      "dependency-review": options.dependencyReviewPass === false ? "failure" : "success",
    },
    events: [{ name: "sca.emergency.branch_opened" }],
    escalated: false,
    agentRequest: undefined,
    availableAgentTools,
    testsIntact: true,
    changedPackages: changedPackagesFor(workItem, options),
    releasePublished: false,
  };

  if (!options.sideEffectsAllowed) {
    return escalate(result, "CAS claim did not allow side effects");
  }
  if (workItem.track !== "emergency" || workItem.state !== "in_progress") {
    return escalate(result, "remediation requires an emergency work item already in_progress");
  }
  if (options.agentBackend.hasMergeTool || availableAgentTools.includes("merge")) {
    return escalate(result, "agent backend exposed a forbidden merge tool");
  }
  if (options.agentBackend.hasSecretTool) {
    return escalate(result, "agent backend exposed a forbidden secret tool");
  }

  const ciResult = applyBoundedFixer(result, options, maxIterations);
  if (!ciResult.ok) {
    return escalate(result, ciResult.reason);
  }

  if (result.checks["dependency-review"] === "failure") {
    return escalate(result, "dependency-review check failed");
  }

  const malicious = dependencyClosure.filter((dependency) =>
    (options.maliciousPackages ?? []).includes(dependency),
  );
  if (malicious.length > 0) {
    result.verdict = {
      decision: "reject",
      rationale: `malware recheck flagged ${malicious.join(", ")}`,
      malwareRecheck: "malicious",
      checkedDependencyClosure: dependencyClosure,
    };
    result.checks["release-reviewer-verdict"] = "failure";
    result.events.push({
      name: "sca.agent.verdict",
      decision: result.verdict.decision,
    });
    return escalate(result, result.verdict.rationale);
  }

  const request = agentRequestSchema.parse({
    findingKey: workItem.findingKey,
    packageName: workItem.packageName,
    fromVersion: workItem.fromVersion,
    toVersion: workItem.fixedVersion,
    allowedPaths: options.allowedPaths,
    dependencyClosure,
    untrustedContext: {
      advisoryText: options.advisoryText,
      changelogText: options.changelogText,
    },
  });
  result.agentRequest = request;

  const reviewerFixAttempts = options.reviewerFixAttempts ?? [];
  for (let reviewAttempt = 0; reviewAttempt <= maxIterations; reviewAttempt += 1) {
    try {
      result.verdict = await runWithTimeout(
        () => runAgentReview(options.agentBackend, request),
        options.agentTimeoutMs ?? 30_000,
      );
    } catch (error) {
      result.checks["release-reviewer-verdict"] = "failure";
      return escalate(result, error instanceof Error ? error.message : "agent review failed");
    }

    result.events.push({
      name: "sca.agent.verdict",
      decision: result.verdict.decision,
    });

    if (result.verdict.decision === "approve") {
      result.checks["release-reviewer-verdict"] = "success";
      result.pr.approved = true;
      result.pr.labels = result.pr.labels.filter((label) => label !== "blocked");
      return result;
    }

    if (reviewAttempt >= maxIterations) {
      break;
    }

    const fixerAttempt = reviewerFixAttempts[reviewAttempt];
    if (fixerAttempt === undefined) {
      break;
    }

    result.events.push({
      name: "sca.reviewer_fix.iteration",
      iteration: reviewAttempt + 1,
    });
    const fixResult = validateFixAttempt(fixerAttempt, options.allowedPaths);
    if (!fixResult.ok) {
      return escalate(result, fixResult.reason);
    }
  }

  result.checks["release-reviewer-verdict"] = "failure";
  return escalate(result, `reviewer verdict ${result.verdict.decision}`);
}

export async function remediateFromFiles(args: {
  workItemsPath: string;
  outputPath: string;
  applyPatch?: boolean;
  repositoryRoot?: string;
  expectedRevision?: string;
  workItemsSha256?: string;
  beforeAtomicReplaceForTest?: (path: string) => Promise<void>;
}): Promise<RemediationResult> {
  const workItemsBytes = await readFile(args.workItemsPath);
  const workItemsFile = parseWorkItemsFile(workItemsBytes);
  const repository = await openRepositoryBoundary(args.repositoryRoot ?? process.cwd());
  if (args.applyPatch) {
    await verifyApplyBinding(repository, workItemsBytes, args);
  }

  const emergencyItems = workItemsFile.workItems.filter((item) => item.track === "emergency");
  if (emergencyItems.length > 1) {
    throw new Error("work-item schema requires exactly one emergency item");
  }
  const selected = emergencyItems[0];
  if (!selected) {
    const result = noEmergencyResult();
    await writeRepositoryOutput(repository, args.outputPath, result);
    return result;
  }
  const matchingEvidence = (workItemsFile.evidence ?? []).filter(
    (record) => record.findingKey === selected.findingKey,
  );
  if (matchingEvidence.length !== 1) {
    throw new Error("work-item schema requires exactly one evidence row for the emergency item");
  }
  const evidence = matchingEvidence[0];
  assertEvidenceConsistency(selected.findingKey, evidence);
  if (!evidence?.osv.fixedVersion) {
    throw new Error("emergency work item is missing normalized evidence/fix");
  }
  const workItem: EmergencyWorkItem = {
    findingKey: selected.findingKey,
    track: "emergency",
    state: selected.state,
    packageName: evidence.raw.package,
    ecosystem: evidence.raw.ecosystem,
    fromVersion: evidence.raw.version,
    fixedVersion: evidence.osv.fixedVersion,
    manifestPaths: evidence.manifestPaths,
  };
  const allowedPaths = allowedPathsFor(workItem.manifestPaths);
  if (args.applyPatch && workItem.manifestPaths.some((path) => path.endsWith("pnpm-lock.yaml"))) {
    throw new Error(
      "pnpm apply is unsupported by bounded remediation; use the dependency-admission pipeline",
    );
  }
  await validateRepositoryTargets(repository, allowedPaths);
  const result = await remediateEmergency(workItem, {
    sideEffectsAllowed: true,
    agentBackend: createClaudeBackend(),
    allowedPaths,
    dependencyClosure: [`${workItem.packageName}@${workItem.fixedVersion}`],
  });
  if (args.applyPatch && result.pr.opened && !result.escalated) {
    await applyDependencyBump(repository, workItem, args.beforeAtomicReplaceForTest);
  }
  await writeRepositoryOutput(repository, args.outputPath, result);
  return result;
}

function noEmergencyResult(): RemediationResult {
  return {
    pr: {
      opened: false,
      merged: false,
      labels: [],
      changedFiles: [],
      approved: false,
    },
    verdict: {
      decision: "escalate",
      rationale: "no emergency work item found",
      malwareRecheck: "unknown",
      checkedDependencyClosure: [],
    },
    checks: {
      build: "skipped",
      test: "skipped",
      sast: "skipped",
      "fixtures-not-installed": "skipped",
      "release-reviewer-verdict": "skipped",
      "dependency-review": "skipped",
    },
    events: [],
    escalated: false,
    blockedReason: "no emergency work item found",
    availableAgentTools: [],
    testsIntact: true,
    changedPackages: [],
    releasePublished: false,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.command !== "remediate-emergency") {
    throw new Error(`unknown command: ${parsed.command}`);
  }
  const result = await remediateFromFiles({
    workItemsPath: parsed.options.get("work-items") ?? ".cache/sca-work-items.json",
    outputPath: parsed.options.get("output") ?? ".cache/sca-remediation-plan.json",
    applyPatch: parsed.options.get("apply") === "true",
    repositoryRoot: parsed.options.get("repository-root"),
    expectedRevision: parsed.options.get("expected-revision"),
    workItemsSha256: parsed.options.get("work-items-sha256"),
  });
  process.stdout.write(
    `sca remediate-emergency completed: pr=${result.pr.opened ? "opened" : "blocked"}, verdict=${result.verdict.decision}, merged=false\n`,
  );
}

function applyBoundedFixer(
  result: RemediationResult,
  options: RemediationOptions,
  maxIterations: number,
): { ok: true } | { ok: false; reason: string } {
  if (options.ciInitiallyGreen !== false) {
    return { ok: true };
  }

  const attempts = options.fixerAttempts ?? [];
  const attemptsToRun = attempts.slice(0, maxIterations);
  for (const [index, attempt] of attemptsToRun.entries()) {
    result.events.push({
      name: "sca.fixer.iteration",
      iteration: index + 1,
    });
    const fixResult = validateFixAttempt(attempt, options.allowedPaths);
    if (!fixResult.ok) {
      result.testsIntact = true;
      return fixResult;
    }
  }

  if (attempts.length > maxIterations || attempts.length !== 1) {
    result.checks.build = "failure";
    result.checks.test = "failure";
    return {
      ok: false,
      reason: `fixer exhausted maxIterations=${maxIterations}`,
    };
  }

  result.checks.build = "success";
  result.checks.test = "success";
  return { ok: true };
}

function validateFixAttempt(
  attempt: {
    path?: string;
    action?: "modify" | "delete" | "command";
    command?: string;
  },
  allowedPaths: string[],
): { ok: true } | { ok: false; reason: string } {
  if (attempt.action === "command" && attempt.command?.includes("osv-scanner fix")) {
    return {
      ok: false,
      reason: "osv-scanner fix is forbidden in the bounded fixer",
    };
  }
  if (attempt.action === "delete" || isTestPath(attempt.path)) {
    return {
      ok: false,
      reason: "fixer attempted to edit or delete a test file",
    };
  }
  if (attempt.path && !allowedPaths.includes(attempt.path)) {
    return {
      ok: false,
      reason: `fixer attempted to edit outside allowedPaths: ${attempt.path}`,
    };
  }
  return { ok: true };
}

function changedPackagesFor(workItem: EmergencyWorkItem, options: RemediationOptions) {
  const requested = options.requestedChanges ?? [
    {
      packageName: workItem.packageName,
      from: workItem.fromVersion,
      to: workItem.fixedVersion,
    },
  ];
  return [
    ...new Set(
      requested
        .filter((change) => change.packageName === workItem.packageName)
        .map((change) => change.packageName),
    ),
  ];
}

function escalate(result: RemediationResult, reason: string): RemediationResult {
  result.escalated = true;
  result.blockedReason = reason;
  result.pr.approved = false;
  result.pr.merged = false;
  if (!result.pr.labels.includes("security-emergency")) {
    result.pr.labels.push("security-emergency");
  }
  if (!result.pr.labels.includes("blocked")) {
    result.pr.labels.push("blocked");
  }
  return result;
}

interface RepositoryBoundary {
  root: string;
  applyAuthorized: boolean;
  expectedRevision?: string;
}

interface CheckedRepositoryFile {
  path: string;
  absolutePath: string;
  bytes: Buffer;
  stat: BigIntStats;
  sha256: string;
}

function parseWorkItemsFile(bytes: Buffer) {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error("work-item JSON failed schema validation", { cause: error });
  }
  const parsed = workItemsFileSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`work-item JSON failed schema validation: ${parsed.error.message}`);
  }
  return parsed.data;
}

function assertEvidenceConsistency(findingKey: string, evidence: NormalizedEvidence) {
  const expectedKey = `${evidence.raw.ecosystem}:${evidence.raw.package}@${evidence.raw.version}:${evidence.raw.advisoryId}`;
  if (findingKey !== expectedKey || evidence.findingKey !== expectedKey) {
    throw new Error("work-item evidence has an inconsistent finding identity");
  }
  if (evidence.osv.advisoryId !== evidence.raw.advisoryId) {
    throw new Error("work-item evidence has an inconsistent advisory identity");
  }
  if (
    evidence.manifestPaths.length !== 1 ||
    evidence.manifestPaths[0] !== evidence.raw.manifestPath
  ) {
    throw new Error("work-item evidence has inconsistent manifest paths");
  }
}

async function openRepositoryBoundary(repositoryRoot: string): Promise<RepositoryBoundary> {
  const requested = resolve(repositoryRoot);
  const requestedStat = await lstat(requested, { bigint: true });
  if (requestedStat.isSymbolicLink() || !requestedStat.isDirectory()) {
    throw new Error("repository root must be a real directory, not a symbolic link");
  }
  const canonical = await realpath(requested);
  if (canonical !== requested) {
    throw new Error("repository root must have a canonical path with no symbolic-link components");
  }
  return { root: canonical, applyAuthorized: false };
}

async function verifyApplyBinding(
  repository: RepositoryBoundary,
  workItemsBytes: Buffer,
  args: {
    repositoryRoot?: string;
    expectedRevision?: string;
    workItemsSha256?: string;
  },
) {
  if (!args.repositoryRoot) {
    throw new Error("apply requires an explicit --repository-root");
  }
  if (!args.expectedRevision || !/^[a-f0-9]{40}$/i.test(args.expectedRevision)) {
    throw new Error("apply requires an immutable 40-character --expected-revision");
  }
  if (!args.workItemsSha256 || !/^[a-f0-9]{64}$/i.test(args.workItemsSha256)) {
    throw new Error("apply requires a 64-character --work-items-sha256");
  }
  const actualDigest = sha256(workItemsBytes);
  if (actualDigest !== args.workItemsSha256.toLowerCase()) {
    throw new Error("reviewed work-item SHA-256 digest does not match the supplied file");
  }
  const actualRevision = await readRepositoryRevision(repository);
  if (actualRevision !== args.expectedRevision.toLowerCase()) {
    throw new Error(
      `repository revision mismatch: expected ${args.expectedRevision.toLowerCase()}, got ${actualRevision}`,
    );
  }
  repository.applyAuthorized = true;
  repository.expectedRevision = args.expectedRevision.toLowerCase();
}

async function readRepositoryRevision(repository: RepositoryBoundary) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repository.root, "rev-parse", "--verify", "HEAD^{commit}"],
      { encoding: "utf8" },
    );
    return stdout.trim();
  } catch (error) {
    throw new Error("repository revision could not be verified", { cause: error });
  }
}

async function assertApplyRevision(repository: RepositoryBoundary) {
  if (!repository.applyAuthorized || !repository.expectedRevision) return;
  const actualRevision = await readRepositoryRevision(repository);
  if (actualRevision !== repository.expectedRevision) {
    throw new Error(
      `repository revision changed during apply: expected ${repository.expectedRevision}, got ${actualRevision}`,
    );
  }
}

function validateRepositoryRelativePath(path: string) {
  if (
    path.length === 0 ||
    path.includes("\0") ||
    path.includes("\\") ||
    isAbsolute(path) ||
    /^[A-Za-z]:/.test(path) ||
    posix.normalize(path) !== path ||
    path.split("/").some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new Error(`path must be canonical and repository-relative: ${path}`);
  }
}

function absoluteRepositoryPath(repository: RepositoryBoundary, path: string) {
  validateRepositoryRelativePath(path);
  const absolutePath = resolve(repository.root, ...path.split("/"));
  const fromRoot = relative(repository.root, absolutePath);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`path resolves outside the repository: ${path}`);
  }
  return absolutePath;
}

async function validatePathComponents(
  repository: RepositoryBoundary,
  path: string,
  options: { allowMissingFinal?: boolean } = {},
) {
  const absolutePath = absoluteRepositoryPath(repository, path);
  const parts = path.split("/");
  let current = repository.root;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const final = index === parts.length - 1;
    let stat: BigIntStats;
    try {
      stat = await lstat(current, { bigint: true });
    } catch (error) {
      if (
        final &&
        options.allowMissingFinal === true &&
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        return { absolutePath, stat: undefined };
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`repository path contains a symbolic link: ${path}`);
    }
    if (!final && !stat.isDirectory()) {
      throw new Error(`repository path parent is not a directory: ${path}`);
    }
    if (final && !stat.isFile()) {
      throw new Error(`repository target is not a regular file: ${path}`);
    }
    if (final) {
      const canonical = await realpath(current);
      if (canonical !== absolutePath) {
        throw new Error(`repository target is not canonical: ${path}`);
      }
      return { absolutePath, stat };
    }
  }
  throw new Error(`repository target is invalid: ${path}`);
}

async function validateRepositoryTargets(repository: RepositoryBoundary, paths: string[]) {
  const uniquePaths = [...new Set(paths)];
  for (const path of uniquePaths) {
    await validatePathComponents(repository, path);
  }
  if (!repository.applyAuthorized) return;
  await assertApplyRevision(repository);
  try {
    await execFileAsync(
      "git",
      ["-C", repository.root, "ls-files", "--error-unmatch", "--", ...uniquePaths],
      { encoding: "utf8" },
    );
    await execFileAsync("git", [
      "-C",
      repository.root,
      "diff",
      "--quiet",
      "HEAD",
      "--",
      ...uniquePaths,
    ]);
    await execFileAsync("git", [
      "-C",
      repository.root,
      "diff",
      "--cached",
      "--quiet",
      "HEAD",
      "--",
      ...uniquePaths,
    ]);
  } catch (error) {
    throw new Error(
      "apply targets must be tracked and unchanged at the expected repository revision",
      {
        cause: error,
      },
    );
  }
  await assertApplyRevision(repository);
}

function sameFingerprint(left: BigIntStats, right: BigIntStats) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.mode === right.mode
  );
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readRepositoryFile(
  repository: RepositoryBoundary,
  path: string,
): Promise<CheckedRepositoryFile> {
  const checked = await validatePathComponents(repository, path);
  const handle = await open(checked.absolutePath, fsConstants.O_RDONLY | noFollowFlag);
  try {
    const descriptorStat = await handle.stat({ bigint: true });
    if (
      !descriptorStat.isFile() ||
      !checked.stat ||
      !sameFingerprint(checked.stat, descriptorStat)
    ) {
      throw new Error(`repository target changed during no-follow open: ${path}`);
    }
    const bytes = await handle.readFile();
    const after = await lstat(checked.absolutePath, { bigint: true });
    if (!sameFingerprint(descriptorStat, after)) {
      throw new Error(`repository target changed during checked read: ${path}`);
    }
    return {
      path,
      absolutePath: checked.absolutePath,
      bytes,
      stat: descriptorStat,
      sha256: sha256(bytes),
    };
  } finally {
    await handle.close();
  }
}

async function assertRepositoryFileUnchanged(
  repository: RepositoryBoundary,
  expected: CheckedRepositoryFile,
) {
  const current = await readRepositoryFile(repository, expected.path);
  if (!sameFingerprint(current.stat, expected.stat) || current.sha256 !== expected.sha256) {
    throw new Error(`repository target changed before atomic replacement: ${expected.path}`);
  }
}

async function atomicReplaceRepositoryFile(
  repository: RepositoryBoundary,
  expected: CheckedRepositoryFile,
  bytes: Buffer,
) {
  const temporaryPath = join(
    dirname(expected.absolutePath),
    `.${posix.basename(expected.path)}.hulumi-${randomUUID()}.tmp`,
  );
  let staged = true;
  const handle = await open(
    temporaryPath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollowFlag,
    Number(expected.stat.mode & 0o777n),
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await assertRepositoryFileUnchanged(repository, expected);
    await rename(temporaryPath, expected.absolutePath);
    staged = false;
    const final = await readRepositoryFile(repository, expected.path);
    if (final.sha256 !== sha256(bytes)) {
      throw new Error(`atomic replacement verification failed: ${expected.path}`);
    }
  } finally {
    if (staged) await unlink(temporaryPath).catch(() => undefined);
  }
}

async function atomicWriteRepositoryOutput(
  repository: RepositoryBoundary,
  path: string,
  bytes: Buffer,
) {
  validateRepositoryRelativePath(path);
  let existing: CheckedRepositoryFile | undefined;
  try {
    existing = await readRepositoryFile(repository, path);
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    )) {
      throw error;
    }
  }
  if (existing) {
    await atomicReplaceRepositoryFile(repository, existing, bytes);
    return;
  }
  const checked = await validatePathComponents(repository, path, { allowMissingFinal: true });
  const temporaryPath = join(
    dirname(checked.absolutePath),
    `.${posix.basename(path)}.hulumi-${randomUUID()}.tmp`,
  );
  let staged = true;
  const handle = await open(
    temporaryPath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | noFollowFlag,
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const stillMissing = await validatePathComponents(repository, path, {
      allowMissingFinal: true,
    });
    if (stillMissing.stat !== undefined) {
      throw new Error(`repository output appeared concurrently: ${path}`);
    }
    await rename(temporaryPath, checked.absolutePath);
    staged = false;
    const final = await readRepositoryFile(repository, path);
    if (final.sha256 !== sha256(bytes)) {
      throw new Error(`repository output verification failed: ${path}`);
    }
  } finally {
    if (staged) await unlink(temporaryPath).catch(() => undefined);
  }
}

async function writeRepositoryOutput(
  repository: RepositoryBoundary,
  outputPath: string,
  result: RemediationResult,
) {
  await atomicWriteRepositoryOutput(
    repository,
    outputPath,
    Buffer.from(`${JSON.stringify(result, null, 2)}\n`),
  );
}

async function runWithTimeout<T>(action: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`agent timeout after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function allowedPathsFor(manifestPaths: string[]) {
  return [
    ...new Set(
      manifestPaths.flatMap((path) => {
        if (path.endsWith("package-lock.json")) {
          return [path, posix.join(posix.dirname(path), "package.json")];
        }
        if (path.endsWith("pnpm-lock.yaml")) {
          return [path];
        }
        if (path.endsWith("packages.lock.json")) {
          return [path, posix.join(posix.dirname(path), "worker-dotnet.csproj")];
        }
        return [path];
      }),
    ),
  ];
}

interface RepositoryMutation {
  original: CheckedRepositoryFile;
  replacement: Buffer;
}

async function applyDependencyBump(
  repository: RepositoryBoundary,
  workItem: EmergencyWorkItem,
  beforeAtomicReplaceForTest?: (path: string) => Promise<void>,
) {
  const mutations: RepositoryMutation[] = [];
  for (const manifestPath of workItem.manifestPaths) {
    if (manifestPath.endsWith("package-lock.json")) {
      if (workItem.ecosystem !== "npm") {
        throw new Error("package-lock.json remediation requires the npm ecosystem");
      }
      mutations.push(await updatePackageLock(repository, manifestPath, workItem));
      mutations.push(
        await updatePackageJson(
          repository,
          posix.join(posix.dirname(manifestPath), "package.json"),
          workItem,
        ),
      );
      continue;
    }
    if (manifestPath.endsWith("pnpm-lock.yaml")) {
      throw new Error(
        "pnpm apply is unsupported by bounded remediation; use the dependency-admission pipeline",
      );
    }
    if (manifestPath.endsWith("requirements.txt")) {
      if (workItem.ecosystem !== "PyPI") {
        throw new Error("requirements.txt remediation requires the PyPI ecosystem");
      }
      mutations.push(await updateRequirements(repository, manifestPath, workItem));
      continue;
    }
    if (manifestPath.endsWith("packages.lock.json")) {
      if (workItem.ecosystem !== "NuGet") {
        throw new Error("packages.lock.json remediation requires the NuGet ecosystem");
      }
      mutations.push(await updatePackagesLock(repository, manifestPath, workItem));
      mutations.push(
        await updateCsproj(
          repository,
          posix.join(posix.dirname(manifestPath), "worker-dotnet.csproj"),
          workItem,
        ),
      );
      continue;
    }
    throw new Error(`unsupported manifest type for bounded remediation: ${manifestPath}`);
  }
  if (
    mutations.length === 0 ||
    mutations.every((mutation) => mutation.original.bytes.equals(mutation.replacement))
  ) {
    throw new Error("bounded remediation found no exact vulnerable version to replace");
  }
  for (const mutation of mutations) {
    await assertRepositoryFileUnchanged(repository, mutation.original);
  }
  await assertApplyRevision(repository);
  if (beforeAtomicReplaceForTest && mutations[0]) {
    await beforeAtomicReplaceForTest(mutations[0].original.path);
  }
  for (const mutation of mutations) {
    if (!mutation.original.bytes.equals(mutation.replacement)) {
      await assertApplyRevision(repository);
      await atomicReplaceRepositoryFile(repository, mutation.original, mutation.replacement);
    }
  }
}

async function updatePackageLock(
  repository: RepositoryBoundary,
  path: string,
  workItem: EmergencyWorkItem,
): Promise<RepositoryMutation> {
  const original = await readRepositoryFile(repository, path);
  const parsed = JSON.parse(original.bytes.toString("utf8")) as {
    packages?: Record<string, { version?: string; dependencies?: Record<string, string> }>;
    dependencies?: Record<string, { version?: string }>;
  };
  parsed.packages ??= {};
  const rootPackage = parsed.packages[""];
  if (rootPackage?.dependencies?.[workItem.packageName] === workItem.fromVersion) {
    rootPackage.dependencies[workItem.packageName] = workItem.fixedVersion;
  }
  const nodePackage = parsed.packages[`node_modules/${workItem.packageName}`];
  if (nodePackage?.version === workItem.fromVersion) {
    nodePackage.version = workItem.fixedVersion;
  }
  const dependency = parsed.dependencies?.[workItem.packageName];
  if (dependency?.version === workItem.fromVersion) {
    dependency.version = workItem.fixedVersion;
  }
  return { original, replacement: Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`) };
}

async function updatePackageJson(
  repository: RepositoryBoundary,
  path: string,
  workItem: EmergencyWorkItem,
): Promise<RepositoryMutation> {
  const original = await readRepositoryFile(repository, path);
  const parsed = JSON.parse(original.bytes.toString("utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  for (const section of [
    parsed.dependencies,
    parsed.devDependencies,
    parsed.optionalDependencies,
  ]) {
    if (section?.[workItem.packageName] === workItem.fromVersion) {
      section[workItem.packageName] = workItem.fixedVersion;
    }
  }
  return { original, replacement: Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`) };
}

async function updateRequirements(
  repository: RepositoryBoundary,
  path: string,
  workItem: EmergencyWorkItem,
): Promise<RepositoryMutation> {
  const original = await readRepositoryFile(repository, path);
  const text = original.bytes.toString("utf8");
  const pattern =
    /(^[ \t]*)([A-Za-z0-9][A-Za-z0-9._-]*)([ \t]*==[ \t]*)([^ \t\r\n#]+)([ \t]*(?:#.*)?$)/gim;
  return {
    original,
    replacement: Buffer.from(
      text.replace(pattern, (line, indentation, packageName, separator, version, suffix) => {
        if (
          String(packageName).toLowerCase() !== workItem.packageName.toLowerCase() ||
          String(version).toLowerCase() !== workItem.fromVersion.toLowerCase()
        ) {
          return line;
        }
        return `${indentation}${packageName}${separator}${workItem.fixedVersion}${suffix}`;
      }),
    ),
  };
}

async function updatePackagesLock(
  repository: RepositoryBoundary,
  path: string,
  workItem: EmergencyWorkItem,
): Promise<RepositoryMutation> {
  const original = await readRepositoryFile(repository, path);
  const parsed = JSON.parse(original.bytes.toString("utf8")) as {
    dependencies?: Record<string, Record<string, { requested?: string; resolved?: string }>>;
  };
  for (const framework of Object.values(parsed.dependencies ?? {})) {
    const dependency = framework[workItem.packageName];
    if (dependency?.resolved === workItem.fromVersion) {
      dependency.resolved = workItem.fixedVersion;
      dependency.requested = `[${workItem.fixedVersion}, )`;
    }
  }
  return { original, replacement: Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`) };
}

async function updateCsproj(
  repository: RepositoryBoundary,
  path: string,
  workItem: EmergencyWorkItem,
): Promise<RepositoryMutation> {
  const original = await readRepositoryFile(repository, path);
  const text = original.bytes.toString("utf8");
  const pattern = /(<PackageReference\s+Include=")([^"]+)("\s+Version=")([^"]+)(")/g;
  return {
    original,
    replacement: Buffer.from(
      text.replace(pattern, (element, prefix, packageName, separator, version, suffix) => {
        if (packageName !== workItem.packageName || version !== workItem.fromVersion) {
          return element;
        }
        return `${prefix}${packageName}${separator}${workItem.fixedVersion}${suffix}`;
      }),
    ),
  };
}

function isTestPath(path?: string) {
  return (
    path !== undefined &&
    (path.startsWith("test/") ||
      path.includes("/test/") ||
      path.endsWith(".test.ts") ||
      path.endsWith(".spec.ts"))
  );
}

function parseArgs(argv: string[]) {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
  const rest = command ? argv.slice(1) : argv;
  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") {
      continue;
    }
    if (token.startsWith("--")) {
      const [key, inlineValue] = token.slice(2).split("=", 2);
      const value = inlineValue ?? rest[index + 1];
      if (inlineValue === undefined) {
        index += 1;
      }
      if (!value) {
        throw new Error(`missing value for --${key}`);
      }
      options.set(key, value);
    }
  }
  return { command, options };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
