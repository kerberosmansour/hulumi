#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { z } from "zod";

export const REQUIRED_CHECKS = [
  "build",
  "test",
  "sast",
  "fixtures-not-installed",
  "release-reviewer-verdict",
  "dependency-review",
] as const;

export type RequiredCheck = (typeof REQUIRED_CHECKS)[number];

export const rulesetConfigSchema = z
  .object({
    requiredChecks: z.array(z.string().min(1)),
    bypassActors: z.array(z.string()),
    nativeAutoMerge: z.boolean(),
    dismissStaleReviews: z.boolean(),
    requiredApprovingReviewCount: z.number().int().min(0),
    identities: z
      .object({
        reviewer: z.string().min(1),
        remediator: z.string().min(1),
        merger: z.string().min(1),
      })
      .strict(),
    botApprovalProbe: z
      .object({
        passed: z.boolean(),
        fallback: z.literal("machine-user").optional(),
      })
      .strict(),
  })
  .strict();

export type RulesetConfig = z.infer<typeof rulesetConfigSchema>;

export interface RulesetVerification {
  ok: boolean;
  failures: string[];
}

export function verifyRuleset(ruleset: RulesetConfig): RulesetVerification {
  const parsed = rulesetConfigSchema.parse(ruleset);
  const failures: string[] = [];

  if (parsed.nativeAutoMerge) {
    failures.push("native auto-merge must be disabled");
  }
  if (parsed.bypassActors.length > 0) {
    failures.push("bypass actor list must be empty");
  }
  if (!sameSet(parsed.requiredChecks, REQUIRED_CHECKS)) {
    failures.push("required checks must match declared set");
  }
  if (!parsed.dismissStaleReviews) {
    failures.push("dismiss-stale reviews must be enabled");
  }
  if (parsed.requiredApprovingReviewCount !== 1) {
    failures.push("required approving review count must be 1");
  }
  if (parsed.identities.merger === parsed.identities.remediator) {
    failures.push("merger identity C must differ from remediator B");
  }
  if (parsed.identities.reviewer === parsed.identities.remediator) {
    failures.push("reviewer identity A must differ from remediator B");
  }
  if (parsed.identities.reviewer === parsed.identities.merger) {
    failures.push("reviewer identity A must differ from merger C");
  }
  if (!parsed.botApprovalProbe.passed && parsed.botApprovalProbe.fallback !== "machine-user") {
    failures.push("bot approval must count or machine-user fallback must be set");
  }

  return { ok: failures.length === 0, failures };
}

export function canRolePerform(
  ruleset: RulesetConfig,
  actor: string,
  action: "push" | "approve" | "merge",
) {
  const parsed = rulesetConfigSchema.parse(ruleset);
  if (actor === parsed.identities.remediator) {
    return action === "push";
  }
  if (actor === parsed.identities.reviewer) {
    return action === "approve";
  }
  if (actor === parsed.identities.merger) {
    return action === "merge";
  }
  return false;
}

export async function readRulesetFile(path: string) {
  return rulesetConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

export async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  const path =
    parsed.options.get("ruleset") ??
    parsed.options.get("config") ??
    "docs/slo/rulesets/sca-main-ruleset.json";
  const result = verifyRuleset(await readRulesetFile(path));
  if (!result.ok) {
    throw new Error(`ruleset verification failed: ${result.failures.join("; ")}`);
  }
  process.stdout.write("sca verify-ruleset completed: ok\n");
}

function sameSet(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

function parseArgs(argv: string[]) {
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const [key, inlineValue] = token.slice(2).split("=", 2);
      const value = inlineValue ?? argv[index + 1];
      if (inlineValue === undefined) {
        index += 1;
      }
      if (!value) {
        throw new Error(`missing value for --${key}`);
      }
      options.set(key, value);
    }
  }
  return { options };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
