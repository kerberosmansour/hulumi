// Regression test locking the structural contract of the documented IAM
// trust policy in `docs/deployment/sandbox-account.md`.
//
// Background: PR #179 fixed a doc-vs-live drift where the documented
// `:sub` value was a single string while the live IAM trust policy used
// an array form to accept the env-form subs from #178's protected-
// Environment workflows. This test prevents that class of drift from
// silently recurring.
//
// Invariants asserted (see docs/slo/tickets/ticket-182-...md §5):
//   1. `:sub` MUST be a JSON array (not a string).
//   2. The canonical `repo:kerberosmansour/hulumi:ref:refs/heads/main`
//      entry MUST appear exactly once.
//   3. Every other entry MUST match
//      `^repo:kerberosmansour/hulumi:environment:[a-z][a-z0-9-]*$`
//      (no wildcards, no other-org names, kebab-case enforced).
//   4. Every `environment:<name>` entry MUST correspond to at least one
//      `environment: <name>` line in some `.github/workflows/*.yml` file.
//   5. The `:sub` array MUST be non-empty (rejects degenerate `[]`).
//
// Per the ticket's anti-exemplar list, the test extracts the JSON
// snippet from the fenced code block in the markdown and `JSON.parse`s
// it, rather than `.includes()`-substring matching. The same anti-pattern
// is what PR #178's URN-anchoring cluster replaced across the policy
// packs.

import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const REPO_ROOT = resolve(__dirname, "../..");
const SANDBOX_ACCOUNT_DOC = join(REPO_ROOT, "docs/deployment/sandbox-account.md");
const WORKFLOWS_DIR = join(REPO_ROOT, ".github/workflows");

const SUB_KEY = "token.actions.githubusercontent.com:sub";
const CANONICAL_REF = "repo:kerberosmansour/hulumi:ref:refs/heads/main";
const ENVIRONMENT_SUB_RE = /^repo:kerberosmansour\/hulumi:environment:[a-z][a-z0-9-]*$/;

/**
 * Extract the documented `:sub` value from the first `json` fenced code
 * block in `docs/deployment/sandbox-account.md`. Throws a named error
 * if the doc shape itself is wrong (no JSON fence, malformed JSON, no
 * `Statement[]` block, no `Condition.StringEquals[:sub]`). Returns the
 * parsed value as-is — caller asserts type. This shape lets the test
 * see *exactly* what a future maintainer mutated `:sub` to.
 */
async function extractSubValue(): Promise<unknown> {
  const doc = await readFile(SANDBOX_ACCOUNT_DOC, "utf8");
  const fence = doc.match(/```json\n([\s\S]*?)\n```/);
  if (!fence) {
    throw new Error("sandbox-account.md: no ```json fenced code block found — doc shape regressed");
  }
  let policy: unknown;
  try {
    policy = JSON.parse(fence[1]);
  } catch (cause) {
    throw new Error(
      `sandbox-account.md: first json fenced block is not valid JSON: ${(cause as Error).message}`,
    );
  }
  const statements = (policy as { Statement?: unknown })?.Statement;
  if (!Array.isArray(statements) || statements.length === 0) {
    throw new Error(
      "sandbox-account.md: parsed JSON has no non-empty Statement[] block — doc shape regressed",
    );
  }
  for (const stmt of statements) {
    const cond = (stmt as { Condition?: { StringEquals?: Record<string, unknown> } })?.Condition
      ?.StringEquals;
    if (cond && SUB_KEY in cond) return cond[SUB_KEY];
  }
  throw new Error(
    `sandbox-account.md: no Statement with Condition.StringEquals["${SUB_KEY}"] — doc shape regressed`,
  );
}

/**
 * Enumerate every `environment:` value declared by any job in any
 * `.github/workflows/*.yml` file. Returns the set of unique names.
 *
 * Regex-only — no YAML parser dependency (per ticket-182 anti-exemplar).
 * Matches the simple scalar form `      environment: <name>` and the
 * object form `      environment:\n        name: <name>`. Templated
 * names like `environment: ${{ inputs.target }}` are intentionally NOT
 * matched — they don't lock to a specific name and so can't be the
 * target of a documented `:sub` entry anyway.
 */
async function enumerateWorkflowEnvNames(): Promise<Set<string>> {
  const entries = await readdir(WORKFLOWS_DIR);
  const yamls = entries.filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  const envs = new Set<string>();
  for (const filename of yamls) {
    const body = await readFile(join(WORKFLOWS_DIR, filename), "utf8");
    const scalarMatches = body.matchAll(
      /^[ \t]*environment:[ \t]+["']?([a-z][a-z0-9_-]*)["']?[ \t]*(?:#.*)?$/gm,
    );
    for (const m of scalarMatches) envs.add(m[1]);
    const objectMatches = body.matchAll(
      /^[ \t]*environment:[ \t]*\n[ \t]+name:[ \t]+["']?([a-z][a-z0-9_-]*)["']?[ \t]*(?:#.*)?$/gm,
    );
    for (const m of objectMatches) envs.add(m[1]);
  }
  return envs;
}

describe("docs/deployment/sandbox-account.md — trust-policy :sub array shape", () => {
  it("[invariants 1+2+5] :sub is a non-empty JSON array containing the canonical ref entry exactly once", async () => {
    const sub = await extractSubValue();
    expect(Array.isArray(sub)).toBe(true);
    const arr = sub as unknown[];
    expect(arr.length, ":sub array must be non-empty").toBeGreaterThan(0);
    const canonicalCount = arr.filter((v) => v === CANONICAL_REF).length;
    expect(
      canonicalCount,
      `:sub must contain "${CANONICAL_REF}" exactly once, found ${canonicalCount}`,
    ).toBe(1);
  });

  it("[invariant 3] every entry matches the canonical-ref OR environment-form regex; no wildcards anywhere", async () => {
    const sub = await extractSubValue();
    expect(Array.isArray(sub)).toBe(true);
    const arr = sub as unknown[];
    for (const entry of arr) {
      expect(typeof entry, "every :sub entry must be a string").toBe("string");
      const s = entry as string;
      expect(s, `:sub entry "${s}" contains a wildcard`).not.toMatch(/\*/);
      if (s === CANONICAL_REF) continue;
      expect(
        ENVIRONMENT_SUB_RE.test(s),
        `:sub entry "${s}" must match canonical-ref or ^repo:kerberosmansour/hulumi:environment:[a-z][a-z0-9-]*$`,
      ).toBe(true);
    }
  });

  it("[invariant 4] every environment:<name> entry corresponds to a workflow YAML reference", async () => {
    const sub = await extractSubValue();
    const arr = (sub as unknown[]).filter((e): e is string => typeof e === "string");
    const envSubs = arr
      .map((s) => s.match(/^repo:kerberosmansour\/hulumi:environment:(.+)$/)?.[1])
      .filter((n): n is string => Boolean(n));
    const workflowEnvs = await enumerateWorkflowEnvNames();
    for (const name of envSubs) {
      expect(
        workflowEnvs.has(name),
        `documented :sub entry environment:${name} has no matching "environment: ${name}" line in any .github/workflows/*.yml — orphan entry`,
      ).toBe(true);
    }
  });

  it("rejects the pre-#179 single-string :sub form", async () => {
    const sub = await extractSubValue();
    // A naked string here means a future edit reverted to the broken
    // pre-#179 form. The Array.isArray assertion above also catches it,
    // but this sibling test produces a clearer, more specific error.
    expect(
      typeof sub,
      ":sub must be a JSON array; a single-string form is the pre-#179 broken state",
    ).not.toBe("string");
  });
});
