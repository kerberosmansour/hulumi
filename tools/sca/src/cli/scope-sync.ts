#!/usr/bin/env node

// `sca scope-sync` — discover -> diff -> classify -> propose.
//
// Exit code is the escalation channel:
//   0 = no drift, or drift fully auto-classified by convention.
//   3 = at least one manifest needs human classification (needsHuman > 0).
//
// `--apply true` writes the proposed scope file but NEVER suppresses exit 3:
// the autonomous path may write the safe `report-only` default for an unknown
// manifest, but it still escalates. Without `--apply`, the scope file is never
// modified (secure default); the drift report is always written.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverManifests } from "../discovery/discover";
import {
  DEFAULT_CONVENTIONS,
  diffScope,
  proposeScope,
  scopeFileSchema,
  type DriftReport,
  type ScopeFile,
} from "../scope/policy";
import {
  classifyDrift,
  createFileScopeBackend,
  type ScopeClassifierBackend,
} from "../agents/classify-scope";

const ESCALATION_EXIT_CODE = 3;

export interface ScopeSyncOptions {
  rootDir: string;
  scopePath: string;
  reportPath: string;
  apply: boolean;
  // When true and a classifier backend is supplied, unclassified manifests are
  // proposed within the deterministic gate (emergency is never grantable).
  classify?: boolean;
  classifier?: ScopeClassifierBackend;
  onWarning?: (message: string) => void;
}

export interface ScopeSyncResult {
  exitCode: number;
  wroteScope: boolean;
  report: DriftReport;
  proposed: ScopeFile;
}

async function readScopeFile(path: string): Promise<ScopeFile> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      // First run: no scope file yet. Start from defaults; everything is "added".
      return { version: 1, conventions: DEFAULT_CONVENTIONS, manifests: [] };
    }
    throw error;
  }
  // A malformed scope file is a hard failure — never silently fall back, because
  // the scope file defines the autonomous merger's reach.
  return scopeFileSchema.parse(JSON.parse(raw));
}

export async function runScopeSync(options: ScopeSyncOptions): Promise<ScopeSyncResult> {
  const discovered = await discoverManifests(options.rootDir);
  const scope = await readScopeFile(options.scopePath);
  let report = diffScope(discovered, scope, scope.conventions);

  if (options.classify && options.classifier) {
    report = await classifyDrift(report, options.classifier, {
      onWarning: options.onWarning,
    });
  }

  const proposed = proposeScope(report, scope.conventions);

  // The drift report is always written (observability), bounded by discovered count.
  await writeJson(options.reportPath, report);

  let wroteScope = false;
  if (options.apply) {
    await writeJson(options.scopePath, proposed);
    wroteScope = true;
  }

  const exitCode = report.needsHuman.length > 0 ? ESCALATION_EXIT_CODE : 0;

  return { exitCode, wroteScope, report, proposed };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function isMissingFileError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const { command, options } = parseArgs(argv);
  if (command !== "scope-sync") {
    throw new Error(`unknown command: ${command}`);
  }
  const applyValue = options.get("apply");
  const classify = options.get("classify") === "true";
  const proposalsPath = options.get("classify-proposals");
  let classifier: ScopeClassifierBackend | undefined;
  if (classify && proposalsPath) {
    // Live handoff: the WIF-authenticated claude-code-action wrote proposals to
    // this file. Read them and feed each through the deterministic clamp.
    const proposals = JSON.parse(await readFile(proposalsPath, "utf8")) as Record<string, unknown>;
    classifier = createFileScopeBackend(proposals);
  } else if (classify) {
    process.stdout.write(
      "sca scope-sync: --classify set without --classify-proposals; no proposals to apply, running deterministic gate only.\n",
    );
  }
  const result = await runScopeSync({
    rootDir: options.get("root") ?? process.cwd(),
    scopePath: options.get("scope") ?? "sca-scope.json",
    reportPath: options.get("report") ?? ".cache/sca-scope-drift.json",
    apply: applyValue === "true",
    classify,
    classifier,
  });

  const { report } = result;
  process.stdout.write(
    `sca scope-sync: firstRun=${String(report.firstRun)}, hasDrift=${String(
      report.hasDrift,
    )}, added=${report.added.length}, removed=${report.removed.length}, needsHuman=${
      report.needsHuman.length
    }, wroteScope=${String(result.wroteScope)}\n`,
  );
  if (report.needsHuman.length > 0) {
    for (const decision of report.needsHuman) {
      process.stdout.write(
        `  needs-human: ${decision.path} (${decision.ecosystem}) — ${decision.rationale}\n`,
      );
    }
  }
  return result.exitCode;
}

function parseArgs(argv: string[]) {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "scope-sync";
  const rest = argv[0] && !argv[0].startsWith("--") ? argv.slice(1) : argv;
  const options = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
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

const entrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (entrypoint) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
