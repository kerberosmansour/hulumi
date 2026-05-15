#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const WF_SHA_1_RULE_ID = "WF_SHA_1_FULL_LENGTH_SHA_PIN";
export const WF_PERM_1_RULE_ID = "WF_PERM_1_MINIMUM_GITHUB_TOKEN_PERMISSIONS";
export const WF_CODEOWNERS_1_RULE_ID = "WF_CODEOWNERS_1_WORKFLOWS_PROTECTED";

const SHA_REF = /^[0-9a-f]{40}$/i;
const USES_LINE = /^\s*-?\s*uses:\s*["']?([^"'\s#]+)["']?/;

function parseArgs(argv) {
  const options = { repoRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--repo-root") {
      const next = argv[i + 1];
      if (!next) throw new Error("--repo-root requires a path");
      options.repoRoot = resolve(next);
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

function isLocalUsesRef(ref) {
  return ref.startsWith("./") || ref.startsWith("../");
}

function lintUsesLine(file, lineNumber, line) {
  const match = line.match(USES_LINE);
  if (!match) return undefined;
  const ref = match[1];
  if (!ref || isLocalUsesRef(ref)) return undefined;
  const at = ref.lastIndexOf("@");
  const version = at === -1 ? "" : ref.slice(at + 1);
  if (SHA_REF.test(version)) return undefined;
  return makeDiagnostic(
    WF_SHA_1_RULE_ID,
    file,
    lineNumber,
    `third-party or reusable workflow reference must use a 40-character commit SHA: ${ref}`,
  );
}

function topLevelPermissionsBlocks(lines) {
  const blocks = [];
  for (let idx = 0; idx < lines.length; idx += 1) {
    if (lines[idx].trim() !== "permissions:" || /^\s/.test(lines[idx])) continue;
    const block = { startLine: idx + 1, lines: [] };
    for (let j = idx + 1; j < lines.length; j += 1) {
      if (lines[j].trim() === "") {
        block.lines.push({ lineNumber: j + 1, text: lines[j] });
        continue;
      }
      if (!/^\s/.test(lines[j])) break;
      block.lines.push({ lineNumber: j + 1, text: lines[j] });
    }
    blocks.push(block);
  }
  return blocks;
}

function lintWorkflowPermissions(file, lines) {
  const diagnostics = [];
  const blocks = topLevelPermissionsBlocks(lines);
  if (blocks.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        WF_PERM_1_RULE_ID,
        file,
        1,
        "workflow must declare top-level minimum GITHUB_TOKEN permissions",
      ),
    );
    return diagnostics;
  }
  for (const block of blocks) {
    for (const entry of block.lines) {
      if (/^\s*contents:\s*write\s*(#.*)?$/i.test(entry.text)) {
        diagnostics.push(
          makeDiagnostic(
            WF_PERM_1_RULE_ID,
            file,
            entry.lineNumber,
            "top-level contents: write grants broad default GITHUB_TOKEN permissions; move write permission to the specific job that needs it",
          ),
        );
      }
    }
  }
  return diagnostics;
}

function lintWorkflowFile(repoRoot, file) {
  const full = join(repoRoot, file);
  const lines = readFileSync(full, "utf8").split(/\r?\n/);
  const diagnostics = [];
  lines.forEach((line, idx) => {
    const diagnostic = lintUsesLine(file, idx + 1, line);
    if (diagnostic) diagnostics.push(diagnostic);
  });
  diagnostics.push(...lintWorkflowPermissions(file, lines));
  return diagnostics;
}

function codeownersProtectsWorkflows(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .some((line) => {
      const pattern = line.split(/\s+/)[0] ?? "";
      return (
        pattern === ".github/workflows/" ||
        pattern === "/.github/workflows/" ||
        pattern === ".github/workflows/*" ||
        pattern === "/.github/workflows/*"
      );
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
    diagnostics.push(...lintWorkflowFile(repoRoot, file));
  }
  diagnostics.push(...lintCodeowners(repoRoot, files));
  return diagnostics;
}

function formatDiagnostic(diagnostic, repoRoot) {
  const file = diagnostic.file.startsWith(repoRoot)
    ? relative(repoRoot, diagnostic.file)
    : diagnostic.file;
  return `${diagnostic.ruleId} ${file}:${diagnostic.line} ${diagnostic.message}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const diagnostics = collectWorkflowGovernanceDiagnostics(options);
    if (diagnostics.length === 0) {
      console.log("workflow-governance: pass");
      process.exit(0);
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
}
