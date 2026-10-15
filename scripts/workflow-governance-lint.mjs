#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { isPlainRecord, parseStrictYaml } from "./protected-dependencies.mjs";

export const WF_SHA_1_RULE_ID = "WF_SHA_1_FULL_LENGTH_SHA_PIN";
export const WF_PERM_1_RULE_ID = "WF_PERM_1_MINIMUM_GITHUB_TOKEN_PERMISSIONS";
export const WF_CODEOWNERS_1_RULE_ID = "WF_CODEOWNERS_1_WORKFLOWS_PROTECTED";
export const WF_ENV_1_RULE_ID = "WF_ENV_1_DISPATCH_PRIVILEGED_JOB_REQUIRES_ENVIRONMENT";
export const WF_ENV_2_RULE_ID = "WF_ENV_2_LIVE_ENVIRONMENT_EXISTS";
export const WF_ENV_3_RULE_ID = "WF_ENV_3_LIVE_ENVIRONMENT_REQUIRES_REVIEWERS";
export const WF_PR_1_RULE_ID = "WF_PR_1_NO_UNTRUSTED_HEAD_CHECKOUT";
export const WF_RUNNER_1_RULE_ID = "WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL";
export const WF_YAML_1_RULE_ID = "WF_YAML_1_STRICT_STRUCTURAL_PARSE";

const SHA_REF = /^[0-9a-f]{40}$/i;
const UNTRUSTED_HEAD_REF =
  /github\.(?:event\.pull_request\.head\.(?:sha|ref|repo\.full_name)|head_ref|event\.workflow_run\.head_sha|event\.workflow_run\.head_branch)/;

function parseArgs(argv) {
  const options = {
    repoRoot: process.cwd(),
    checkSettings: false,
    approvedSelfHostedRunnerLabels: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--repo-root") {
      const value = argv[i + 1];
      if (!value) throw new Error("--repo-root requires a path");
      options.repoRoot = resolve(value);
      i += 1;
    } else if (argv[i] === "--check-settings") {
      options.checkSettings = true;
    } else if (argv[i] === "--allow-self-hosted-runner-label") {
      const value = argv[i + 1];
      if (!value) throw new Error("--allow-self-hosted-runner-label requires a label");
      options.approvedSelfHostedRunnerLabels.push(value);
      i += 1;
    } else {
      throw new Error(`unknown argument: ${argv[i]}`);
    }
  }
  return options;
}

function listTrackedGovernanceFiles(repoRoot) {
  const result = spawnSync(
    "git",
    [
      "-C",
      repoRoot,
      "ls-files",
      ".github/workflows/*.yml",
      ".github/workflows/*.yaml",
      ".github/CODEOWNERS",
      "CODEOWNERS",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return undefined;
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function listFixtureGovernanceFiles(repoRoot) {
  const files = [];
  const workflowDir = join(repoRoot, ".github", "workflows");
  if (existsSync(workflowDir) && statSync(workflowDir).isDirectory()) {
    for (const entry of readdirSync(workflowDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".yml") && !entry.name.endsWith(".yaml")) continue;
      files.push(join(".github", "workflows", entry.name));
    }
  }
  for (const candidate of [join(".github", "CODEOWNERS"), "CODEOWNERS"]) {
    if (existsSync(join(repoRoot, candidate))) files.push(candidate);
  }
  return files.sort();
}

function listGovernanceFiles(repoRoot) {
  const tracked = listTrackedGovernanceFiles(repoRoot);
  if (tracked && tracked.length > 0) return tracked;
  return listFixtureGovernanceFiles(repoRoot);
}

function makeDiagnostic(ruleId, file, line, message) {
  return { ruleId, file, line, message };
}

function workflowDiagnostic(file, message) {
  return makeDiagnostic(WF_YAML_1_RULE_ID, file, 1, message);
}

function parseWorkflowFile(repoRoot, file) {
  try {
    const workflow = parseStrictYaml(readFileSync(join(repoRoot, file), "utf8"), file);
    if (!isPlainRecord(workflow)) {
      throw new Error("workflow root must be a mapping");
    }
    if (workflow.jobs !== undefined && !isPlainRecord(workflow.jobs)) {
      throw new Error("workflow jobs must be a mapping");
    }
    if (
      workflow.permissions !== undefined &&
      typeof workflow.permissions !== "string" &&
      !isPlainRecord(workflow.permissions)
    ) {
      throw new Error("workflow permissions must be a string or mapping");
    }
    for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
      if (!isPlainRecord(job)) throw new Error(`workflow job '${jobId}' must be a mapping`);
      if (job.steps !== undefined && !Array.isArray(job.steps)) {
        throw new Error(`workflow job '${jobId}' steps must be a sequence`);
      }
      if (Array.isArray(job.steps) && job.steps.some((step) => !isPlainRecord(step))) {
        throw new Error(`workflow job '${jobId}' steps must contain mappings`);
      }
    }
    return { workflow, diagnostics: [] };
  } catch (error) {
    return {
      workflow: undefined,
      diagnostics: [
        workflowDiagnostic(file, error instanceof Error ? error.message : String(error)),
      ],
    };
  }
}

function jobsOf(workflow) {
  if (!isPlainRecord(workflow.jobs)) return [];
  return Object.entries(workflow.jobs).filter((entry) => isPlainRecord(entry[1]));
}

function stepsOf(job) {
  return Array.isArray(job.steps) ? job.steps.filter(isPlainRecord) : [];
}

function isLocalUsesRef(ref) {
  return ref.startsWith("./") || ref.startsWith("../");
}

function lintUses(file, workflow) {
  const diagnostics = [];
  const references = [];
  for (const [, job] of jobsOf(workflow)) {
    if (Object.hasOwn(job, "uses")) references.push(job.uses);
    for (const step of stepsOf(job)) {
      if (Object.hasOwn(step, "uses")) references.push(step.uses);
    }
  }
  for (const ref of references) {
    if (typeof ref !== "string") {
      diagnostics.push(workflowDiagnostic(file, "uses references must be strings"));
      continue;
    }
    if (isLocalUsesRef(ref)) continue;
    const at = ref.lastIndexOf("@");
    const version = at === -1 ? "" : ref.slice(at + 1);
    if (SHA_REF.test(version)) continue;
    diagnostics.push(
      makeDiagnostic(
        WF_SHA_1_RULE_ID,
        file,
        1,
        `third-party or reusable workflow reference must use a 40-character commit SHA: ${ref}`,
      ),
    );
  }
  return diagnostics;
}

function lintWorkflowPermissions(file, workflow) {
  if (!Object.hasOwn(workflow, "permissions")) {
    return [
      makeDiagnostic(
        WF_PERM_1_RULE_ID,
        file,
        1,
        "workflow must declare top-level minimum GITHUB_TOKEN permissions",
      ),
    ];
  }
  const permissions = workflow.permissions;
  if (permissions === "write-all") {
    return [
      makeDiagnostic(
        WF_PERM_1_RULE_ID,
        file,
        1,
        "top-level write-all grants broad default GITHUB_TOKEN permissions",
      ),
    ];
  }
  if (isPlainRecord(permissions) && String(permissions.contents).toLowerCase() === "write") {
    return [
      makeDiagnostic(
        WF_PERM_1_RULE_ID,
        file,
        1,
        "top-level contents: write grants broad default GITHUB_TOKEN permissions; move write permission to the specific job that needs it",
      ),
    ];
  }
  return [];
}

function workflowHasTrigger(workflow, trigger) {
  const on = workflow.on;
  if (typeof on === "string") return on === trigger;
  if (Array.isArray(on)) return on.includes(trigger);
  return isPlainRecord(on) && Object.hasOwn(on, trigger);
}

function lintPrivilegedUntrustedHeadCheckout(file, workflow) {
  const trigger = workflowHasTrigger(workflow, "pull_request_target")
    ? "pull_request_target"
    : workflowHasTrigger(workflow, "workflow_run")
      ? "workflow_run"
      : undefined;
  if (!trigger) return [];

  const diagnostics = [];
  for (const [, job] of jobsOf(workflow)) {
    for (const step of stepsOf(job)) {
      if (
        typeof step.uses !== "string" ||
        !step.uses.toLowerCase().startsWith("actions/checkout@")
      ) {
        continue;
      }
      if (!isPlainRecord(step.with)) continue;
      if (!UNTRUSTED_HEAD_REF.test(JSON.stringify(step.with))) continue;
      diagnostics.push(
        makeDiagnostic(
          WF_PR_1_RULE_ID,
          file,
          1,
          `${trigger} workflow checks out attacker-controlled head code in a privileged context; use pull_request for code execution or keep this workflow metadata-only`,
        ),
      );
    }
  }
  return diagnostics;
}

function privilegedReason(job) {
  if (typeof job.uses === "string" && /aws-actions\/configure-aws-credentials/i.test(job.uses)) {
    return "uses aws-actions/configure-aws-credentials";
  }
  for (const step of stepsOf(job)) {
    if (
      typeof step.uses === "string" &&
      /aws-actions\/configure-aws-credentials/i.test(step.uses)
    ) {
      return "uses aws-actions/configure-aws-credentials";
    }
    if (isPlainRecord(step.with) && Object.hasOwn(step.with, "role-to-assume")) {
      return "declares role-to-assume";
    }
    if (typeof step.run === "string" && /\bpulumi\s+destroy\b/.test(step.run)) {
      return "runs pulumi destroy";
    }
  }
  return undefined;
}

function hasEnvironment(job) {
  return Object.hasOwn(job, "environment");
}

function environmentName(job) {
  const value = job.environment;
  const name = isPlainRecord(value) ? value.name : value;
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    name.length > 255 ||
    name.includes("${{") ||
    /[\r\n]/.test(name)
  ) {
    return undefined;
  }
  return name;
}

function lintWorkflowDispatchEnvironments(file, workflow) {
  if (!workflowHasTrigger(workflow, "workflow_dispatch")) return [];
  const diagnostics = [];
  for (const [jobId, job] of jobsOf(workflow)) {
    const reason = privilegedReason(job);
    if (!reason || environmentName(job)) continue;
    diagnostics.push(
      makeDiagnostic(
        WF_ENV_1_RULE_ID,
        file,
        1,
        `workflow_dispatch job '${jobId}' is privileged (${reason}) and must declare a protected 'environment:' with required reviewers`,
      ),
    );
  }
  return diagnostics;
}

function runnerLabels(value) {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .filter((label) => typeof label === "string")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
}

function lintSelfHostedRunnerUsage(file, workflow, approvedLabels) {
  const approved = new Set((approvedLabels ?? []).map((label) => label.trim().toLowerCase()));
  const diagnostics = [];
  for (const [jobId, job] of jobsOf(workflow)) {
    const labels = runnerLabels(job["runs-on"]);
    if (!labels.includes("self-hosted")) continue;
    const custom = labels.filter((label) => label !== "self-hosted");
    const unapproved = custom.filter((label) => !approved.has(label));
    if (approved.size > 0 && custom.length > 0 && unapproved.length === 0) continue;
    diagnostics.push(
      makeDiagnostic(
        WF_RUNNER_1_RULE_ID,
        file,
        1,
        `job '${jobId}' uses self-hosted runners; every non-self-hosted label must be explicitly approved (unapproved: ${unapproved.length > 0 ? unapproved.join(", ") : "none declared"})`,
      ),
    );
  }
  return diagnostics;
}

function lintWorkflowModel(file, workflow, options = {}) {
  return [
    ...lintUses(file, workflow),
    ...lintWorkflowPermissions(file, workflow),
    ...lintPrivilegedUntrustedHeadCheckout(file, workflow),
    ...lintWorkflowDispatchEnvironments(file, workflow),
    ...lintSelfHostedRunnerUsage(file, workflow, options.approvedSelfHostedRunnerLabels ?? []),
  ];
}

function codeownersProtectsWorkflows(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .some((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      const covers =
        pattern === ".github/workflows/" ||
        pattern === "/.github/workflows/" ||
        pattern === ".github/workflows/*" ||
        pattern === "/.github/workflows/*";
      const validOwner = owners.some(
        (owner) =>
          /^@[A-Za-z0-9](?:[A-Za-z0-9_-]*)(?:\/[A-Za-z0-9][A-Za-z0-9_-]*)?$/.test(owner) ||
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(owner),
      );
      return covers && validOwner;
    });
}

function lintCodeowners(repoRoot, files) {
  const codeowners = files.filter(
    (file) => file === "CODEOWNERS" || file === join(".github", "CODEOWNERS"),
  );
  for (const file of codeowners) {
    if (codeownersProtectsWorkflows(readFileSync(join(repoRoot, file), "utf8"))) return [];
  }
  return [
    makeDiagnostic(
      WF_CODEOWNERS_1_RULE_ID,
      "CODEOWNERS",
      1,
      "CODEOWNERS must include an owner for /.github/workflows/",
    ),
  ];
}

export function collectWorkflowGovernanceDiagnostics(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const files = listGovernanceFiles(repoRoot);
  const diagnostics = [];
  for (const file of files) {
    if (!file.startsWith(".github/workflows/")) continue;
    const parsed = parseWorkflowFile(repoRoot, file);
    diagnostics.push(...parsed.diagnostics);
    if (parsed.workflow) diagnostics.push(...lintWorkflowModel(file, parsed.workflow, options));
  }
  diagnostics.push(...lintCodeowners(repoRoot, files));
  return diagnostics;
}

export async function collectWorkflowGovernanceDiagnosticsAsync(options = {}) {
  const diagnostics = collectWorkflowGovernanceDiagnostics(options);
  if (!options.checkSettings) return diagnostics;
  if (typeof options.resolveEnvironment !== "function") {
    throw new Error(
      "collectWorkflowGovernanceDiagnosticsAsync: checkSettings=true requires options.resolveEnvironment to be a function",
    );
  }

  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const files = listGovernanceFiles(repoRoot);
  const candidates = [];
  for (const file of files) {
    if (!file.startsWith(".github/workflows/")) continue;
    const parsed = parseWorkflowFile(repoRoot, file);
    if (!parsed.workflow || !workflowHasTrigger(parsed.workflow, "workflow_dispatch")) continue;
    for (const [jobId, job] of jobsOf(parsed.workflow)) {
      if (!privilegedReason(job) || !hasEnvironment(job)) continue;
      const envName = environmentName(job);
      if (!envName) {
        diagnostics.push(
          makeDiagnostic(
            WF_ENV_2_RULE_ID,
            file,
            1,
            `privileged job '${jobId}' must declare a statically resolvable environment name for protection verification`,
          ),
        );
        continue;
      }
      candidates.push({ envName, file, line: 1 });
    }
  }

  const cache = new Map();
  for (const candidate of candidates) {
    if (!cache.has(candidate.envName)) {
      cache.set(candidate.envName, resolveSafely(options.resolveEnvironment, candidate.envName));
    }
  }
  for (const candidate of candidates) {
    const result = await cache.get(candidate.envName);
    if (result.error) {
      diagnostics.push(
        makeDiagnostic(
          WF_ENV_2_RULE_ID,
          candidate.file,
          candidate.line,
          `environment '${candidate.envName}' resolver error: ${result.error}`,
        ),
      );
    } else if (result.value === null) {
      diagnostics.push(
        makeDiagnostic(
          WF_ENV_2_RULE_ID,
          candidate.file,
          candidate.line,
          `environment '${candidate.envName}' declared in workflow but not configured in repo settings`,
        ),
      );
    } else if (!environmentHasRequiredReviewers(result.value)) {
      diagnostics.push(
        makeDiagnostic(
          WF_ENV_3_RULE_ID,
          candidate.file,
          candidate.line,
          `environment '${candidate.envName}' configured but lacks required reviewer protection`,
        ),
      );
    }
  }
  return diagnostics;
}

function environmentHasRequiredReviewers(environment) {
  const rules = environment.protection_rules;
  if (!Array.isArray(rules)) return false;
  return rules.some(
    (rule) =>
      isPlainRecord(rule) &&
      rule.type === "required_reviewers" &&
      Array.isArray(rule.reviewers) &&
      rule.reviewers.some(
        (entry) =>
          isPlainRecord(entry) &&
          (entry.type === "User" || entry.type === "Team") &&
          isPlainRecord(entry.reviewer) &&
          Number.isSafeInteger(entry.reviewer.id) &&
          entry.reviewer.id > 0,
      ),
  );
}

async function resolveSafely(resolver, name) {
  try {
    return { value: await resolver(name), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function productionResolveEnvironment(name) {
  const result = spawnSync(
    "gh",
    [
      "api",
      `/repos/{owner}/{repo}/environments/${encodeURIComponent(name)}`,
      "-H",
      "Accept: application/vnd.github+json",
    ],
    { encoding: "utf8" },
  );
  if (result.error && result.error.code === "ENOENT") {
    throw new Error("`gh` CLI not installed or not on PATH");
  }
  if (result.status === 0) {
    try {
      return JSON.parse(result.stdout);
    } catch (error) {
      throw new Error(
        `gh api returned non-JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  const stderr = (result.stderr ?? "").trim();
  if (/HTTP 404|Not Found/i.test(stderr)) return null;
  throw new Error(`gh api failed (exit ${result.status}): ${stderr || "no stderr"}`);
}

function formatDiagnostic(diagnostic, repoRoot) {
  const file = diagnostic.file.startsWith(repoRoot)
    ? relative(repoRoot, diagnostic.file)
    : diagnostic.file;
  return `${diagnostic.ruleId} ${file}:${diagnostic.line} ${diagnostic.message}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  (async () => {
    try {
      const options = parseArgs(process.argv.slice(2));
      const diagnostics = options.checkSettings
        ? await collectWorkflowGovernanceDiagnosticsAsync({
            ...options,
            resolveEnvironment: productionResolveEnvironment,
          })
        : collectWorkflowGovernanceDiagnostics(options);
      if (diagnostics.length === 0) {
        console.log("workflow-governance: pass");
        return;
      }
      console.error("workflow-governance: fail");
      for (const diagnostic of diagnostics) {
        console.error(formatDiagnostic(diagnostic, options.repoRoot));
      }
      process.exit(1);
    } catch (error) {
      console.error("workflow-governance: error");
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
  })();
}
