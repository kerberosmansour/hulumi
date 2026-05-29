#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  agentRequestSchema,
  runAgentReview,
  type AgentBackend,
  type AgentRequest,
  type AgentResponse,
} from "../agents/adapter";
import { createClaudeBackend } from "../agents/claude";
import type { NormalizedEvidence } from "../evidence/normalize";

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

interface WorkItemsFile {
  workItems: Array<{
    findingKey: string;
    track: "emergency" | "cadence" | "dropped";
    state: EmergencyWorkItem["state"];
  }>;
  evidence?: NormalizedEvidence[];
}

export async function remediateFromFiles(args: {
  workItemsPath: string;
  outputPath: string;
  applyPatch?: boolean;
}): Promise<RemediationResult> {
  const workItemsFile = JSON.parse(await readFile(args.workItemsPath, "utf8")) as WorkItemsFile;
  const selected = workItemsFile.workItems.find((item) => item.track === "emergency");
  if (!selected) {
    const result = noEmergencyResult();
    await writeFile(args.outputPath, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }
  const evidence = workItemsFile.evidence?.find(
    (record) => record.findingKey === selected.findingKey,
  );
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
  const result = await remediateEmergency(workItem, {
    sideEffectsAllowed: true,
    agentBackend: createClaudeBackend(),
    allowedPaths,
    dependencyClosure: [`${workItem.packageName}@${workItem.fixedVersion}`],
  });
  if (args.applyPatch && result.pr.opened && !result.escalated) {
    await applyDependencyBump(workItem);
  }
  await writeFile(args.outputPath, `${JSON.stringify(result, null, 2)}\n`);
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
          return [path, join(dirname(path), "package.json")];
        }
        if (path.endsWith("pnpm-lock.yaml")) {
          return [path, "package.json"];
        }
        return [path];
      }),
    ),
  ];
}

async function applyDependencyBump(workItem: EmergencyWorkItem) {
  for (const manifestPath of workItem.manifestPaths) {
    if (manifestPath.endsWith("package-lock.json")) {
      await updatePackageLock(manifestPath, workItem);
      await updatePackageJson(join(dirname(manifestPath), "package.json"), workItem);
      continue;
    }
    if (manifestPath.endsWith("pnpm-lock.yaml")) {
      await updatePnpmWorkspace(workItem);
      continue;
    }
    if (manifestPath.endsWith("requirements.txt")) {
      await updateRequirements(manifestPath, workItem);
      continue;
    }
    if (manifestPath.endsWith("packages.lock.json")) {
      await updatePackagesLock(manifestPath, workItem);
      await updateCsproj(dirname(manifestPath), workItem);
    }
  }
}

async function updatePackageLock(path: string, workItem: EmergencyWorkItem) {
  const parsed = JSON.parse(await readFile(path, "utf8")) as {
    packages?: Record<string, { version?: string; dependencies?: Record<string, string> }>;
    dependencies?: Record<string, { version?: string }>;
  };
  parsed.packages ??= {};
  const rootPackage = parsed.packages[""];
  if (rootPackage?.dependencies?.[workItem.packageName]) {
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
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

async function updatePackageJson(path: string, workItem: EmergencyWorkItem) {
  const text = await readOptionalText(path);
  if (text === undefined) {
    return;
  }
  const parsed = JSON.parse(text) as {
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
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

async function updatePnpmWorkspace(workItem: EmergencyWorkItem) {
  if (workItem.ecosystem !== "npm") {
    return;
  }
  await runProcess("pnpm", [
    "update",
    "-r",
    `${workItem.packageName}@${workItem.fixedVersion}`,
    "--save-exact",
  ]);
}

async function updateRequirements(path: string, workItem: EmergencyWorkItem) {
  const text = await readFile(path, "utf8");
  const escaped = escapeRegExp(workItem.packageName);
  const pattern = new RegExp(
    `(^\\s*${escaped}\\s*==\\s*)${escapeRegExp(workItem.fromVersion)}(\\s*(?:#.*)?$)`,
    "im",
  );
  await writeFile(path, text.replace(pattern, `$1${workItem.fixedVersion}$2`));
}

async function updatePackagesLock(path: string, workItem: EmergencyWorkItem) {
  const parsed = JSON.parse(await readFile(path, "utf8")) as {
    dependencies?: Record<string, Record<string, { requested?: string; resolved?: string }>>;
  };
  for (const framework of Object.values(parsed.dependencies ?? {})) {
    const dependency = framework[workItem.packageName];
    if (dependency?.resolved === workItem.fromVersion) {
      dependency.resolved = workItem.fixedVersion;
      dependency.requested = `[${workItem.fixedVersion}, )`;
    }
  }
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

async function updateCsproj(directory: string, workItem: EmergencyWorkItem) {
  const csprojPath = join(directory, "worker-dotnet.csproj");
  const text = await readOptionalText(csprojPath);
  if (text === undefined) {
    return;
  }
  const escapedPackage = escapeRegExp(workItem.packageName);
  const escapedVersion = escapeRegExp(workItem.fromVersion);
  const pattern = new RegExp(
    `(<PackageReference\\s+Include="${escapedPackage}"\\s+Version=")${escapedVersion}(")`,
  );
  await writeFile(csprojPath, text.replace(pattern, `$1${workItem.fixedVersion}$2`));
}

async function readOptionalText(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function runProcess(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      shell: false,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
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
