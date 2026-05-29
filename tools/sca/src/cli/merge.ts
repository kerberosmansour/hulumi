#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { buildAuditRecord, writeAuditRecord, type AuditRecord } from "../audit/record";
import {
  REQUIRED_CHECKS,
  canRolePerform,
  readRulesetFile,
  verifyRuleset,
  type RulesetConfig,
} from "./verify-ruleset";

export interface MergeInput {
  findingKey: string;
  advisoryId: string;
  packageName: string;
  fromVersion: string;
  toVersion: string;
  author: string;
  reviewer: string;
  reviewerState: "APPROVED" | "REQUEST_CHANGES" | "PENDING" | "DISMISSED";
  approvalStale?: boolean;
  checks: Record<string, "success" | "failure" | "skipped">;
  alreadyRemediated?: boolean;
  majorVersionBump?: boolean;
}

export interface MergeResult {
  merged: boolean;
  releasePublished: boolean;
  state: "remediated" | "escalated" | "in_progress";
  auditRecord?: AuditRecord;
  auditWrittenBeforeMerge: boolean;
  blockedReason?: string;
  githubProtectionRejected: boolean;
  events: Array<{ name: string; decision?: string }>;
}

export interface MergeOptions {
  actor: string;
  ruleset: RulesetConfig;
  now?: string;
  auditWriter?: (record: AuditRecord) => Promise<AuditRecord>;
}

export async function mergeEmergencyPr(
  input: MergeInput,
  options: MergeOptions,
): Promise<MergeResult> {
  const result: MergeResult = {
    merged: false,
    releasePublished: false,
    state: input.alreadyRemediated ? "remediated" : "in_progress",
    auditWrittenBeforeMerge: false,
    githubProtectionRejected: false,
    events: [],
  };

  if (input.alreadyRemediated) {
    result.events.push({
      name: "sca.merge_gate.decision",
      decision: "already-remediated",
    });
    return result;
  }

  const rulesetResult = verifyRuleset(options.ruleset);
  if (!rulesetResult.ok) {
    return block(result, `ruleset drift: ${rulesetResult.failures.join("; ")}`, true);
  }

  if (!canRolePerform(options.ruleset, options.actor, "merge")) {
    return block(
      result,
      `merger identity required; ${options.actor} cannot merge`,
      options.actor === options.ruleset.identities.remediator,
    );
  }

  if (input.majorVersionBump) {
    return block(result, "major version bump cannot auto-merge", true);
  }

  if (input.approvalStale) {
    return block(result, "reviewer approval is stale after remediator push", true);
  }

  if (
    input.reviewer !== options.ruleset.identities.reviewer ||
    input.reviewer === input.author ||
    input.reviewerState !== "APPROVED"
  ) {
    return block(result, "required reviewer approval is missing", true);
  }

  const failingChecks = REQUIRED_CHECKS.filter((check) => input.checks[check] !== "success");
  if (failingChecks.length > 0) {
    return block(result, `required checks are not green: ${failingChecks.join(", ")}`, true);
  }

  const auditRecord = buildAuditRecord({
    findingKey: input.findingKey,
    advisoryId: input.advisoryId,
    packageName: input.packageName,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    reviewer: input.reviewer,
    merger: options.actor,
    checks: input.checks,
    createdAt: options.now ?? new Date().toISOString(),
  });

  try {
    result.auditRecord = await (options.auditWriter ?? writeAuditRecord)(auditRecord);
    result.auditWrittenBeforeMerge = true;
  } catch (error) {
    return block(
      result,
      `audit write failed before merge: ${error instanceof Error ? error.message : String(error)}`,
      false,
    );
  }

  result.merged = true;
  result.releasePublished = true;
  result.state = "remediated";
  result.events.push(
    { name: "sca.merge_gate.decision", decision: "merged" },
    { name: "sca.release.published" },
  );
  return result;
}

interface RemediationPlan {
  pr?: { approved?: boolean };
  agentRequest?: {
    findingKey: string;
    packageName: string;
    fromVersion: string;
    toVersion: string;
  };
  checks?: Record<string, "success" | "failure" | "skipped">;
}

export async function mergeFromFiles(args: {
  planPath: string;
  rulesetPath: string;
  outputPath: string;
  auditDir?: string;
}) {
  const plan = JSON.parse(await readFile(args.planPath, "utf8")) as RemediationPlan;
  const ruleset = await readRulesetFile(args.rulesetPath);
  if (!plan.agentRequest || !plan.pr?.approved) {
    const noOp = noMergeResult("no approved remediation PR plan found");
    await writeFile(args.outputPath, `${JSON.stringify(noOp, null, 2)}\n`);
    return noOp;
  }

  const input: MergeInput = {
    findingKey: plan.agentRequest.findingKey,
    advisoryId: advisoryFromFindingKey(plan.agentRequest.findingKey),
    packageName: plan.agentRequest.packageName,
    fromVersion: plan.agentRequest.fromVersion,
    toVersion: plan.agentRequest.toVersion,
    author: ruleset.identities.remediator,
    reviewer: ruleset.identities.reviewer,
    reviewerState: "APPROVED",
    checks: {
      ...Object.fromEntries(REQUIRED_CHECKS.map((check) => [check, "success"])),
      ...(plan.checks ?? {}),
    },
  };

  const result = await mergeEmergencyPr(input, {
    actor: ruleset.identities.merger,
    ruleset,
    auditWriter: (record) => writeAuditRecord(record, { auditDir: args.auditDir }),
  });
  await writeFile(args.outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const command = parsed.command === "merge" ? "merge" : parsed.command;
  if (command !== "merge") {
    throw new Error(`unknown command: ${parsed.command}`);
  }
  const result = await mergeFromFiles({
    planPath: parsed.options.get("plan") ?? ".cache/sca-remediation-plan.json",
    rulesetPath: parsed.options.get("ruleset") ?? "docs/slo/rulesets/sca-main-ruleset.json",
    outputPath: parsed.options.get("output") ?? ".cache/sca-merge-result.json",
    auditDir: parsed.options.get("audit-dir") ?? ".cache/audit",
  });
  process.stdout.write(
    `sca merge completed: merged=${String(result.merged)}, release=${String(result.releasePublished)}, state=${result.state}\n`,
  );
}

function block(result: MergeResult, reason: string, githubProtectionRejected: boolean) {
  result.state = "escalated";
  result.blockedReason = reason;
  result.githubProtectionRejected = githubProtectionRejected;
  result.events.push({
    name: "sca.merge_gate.decision",
    decision: "escalated",
  });
  return result;
}

function noMergeResult(reason: string): MergeResult {
  return {
    merged: false,
    releasePublished: false,
    state: "in_progress",
    auditWrittenBeforeMerge: false,
    blockedReason: reason,
    githubProtectionRejected: false,
    events: [],
  };
}

function advisoryFromFindingKey(findingKey: string) {
  const advisoryId = findingKey.split(":").at(-1);
  if (!advisoryId) {
    throw new Error(`cannot derive advisory id from ${findingKey}`);
  }
  return advisoryId;
}

function parseArgs(argv: string[]) {
  const command = argv[0] && !argv[0].startsWith("--") ? argv[0] : "";
  const rest = command ? argv.slice(1) : argv;
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
