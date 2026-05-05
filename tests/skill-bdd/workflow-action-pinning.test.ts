// Workflow action SHA-pinning BDD (Runbook hulumi-pre-public-launch M2).
//
// Enforces that every `uses:` reference across the .github/workflows/*.yml
// files names a 40-char commit SHA, with the original tag preserved as a
// trailing `# vN` comment for human readability + Dependabot integration.
//
// A pinned-tag like `actions/checkout@v6` is a moving reference; a SHA
// pin like `actions/checkout@<40-char-sha> # v6` is immutable. For a
// hardened-by-default project, the SHA pin is the only acceptable shape.

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");
const workflowsDir = resolve(repoRoot, ".github", "workflows");

const SHA_PIN_LINE = /^\s*-?\s*uses:\s+([^@\s]+)@([0-9a-f]{40})(\s+#\s+(\S+))?\s*$/;
const ANY_USES_LINE = /^\s*-?\s*uses:\s+(\S+)(\s+#.*)?\s*$/;

interface UsesRef {
  file: string;
  lineNumber: number;
  raw: string;
  action?: string;
  sha?: string;
  tagComment?: string;
}

function listWorkflowFiles(): string[] {
  return readdirSync(workflowsDir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => resolve(workflowsDir, f));
}

function collectUsesRefs(): UsesRef[] {
  const refs: UsesRef[] = [];
  for (const file of listWorkflowFiles()) {
    const content = readFileSync(file, "utf8");
    content.split(/\r?\n/).forEach((rawLine, idx) => {
      const trimmed = rawLine.replace(/\s+$/, "");
      const usesMatch = trimmed.match(ANY_USES_LINE);
      if (!usesMatch) return;
      const fileBase = file.replace(`${repoRoot}/`, "");
      const ref: UsesRef = { file: fileBase, lineNumber: idx + 1, raw: trimmed };
      const shaMatch = trimmed.match(SHA_PIN_LINE);
      if (shaMatch) {
        ref.action = shaMatch[1];
        ref.sha = shaMatch[2];
        ref.tagComment = shaMatch[4];
      }
      refs.push(ref);
    });
  }
  return refs;
}

describe("Feature: Workflow action SHA-pinning (Runbook hulumi-pre-public-launch M2)", () => {
  describe("Scenario: every `uses:` in .github/workflows/*.yml is SHA-pinned", () => {
    it("walks all workflow files and asserts each uses: line matches the SHA-pin regex", () => {
      const refs = collectUsesRefs();
      expect(refs.length, "no `uses:` lines found in .github/workflows/").toBeGreaterThan(0);

      const violations = refs.filter((r) => !r.sha);
      const message = violations
        .map((v) => `  ${v.file}:${v.lineNumber} → ${v.raw.trim()}`)
        .join("\n");

      expect(
        violations,
        `Found ${violations.length} action use(s) not SHA-pinned:\n${message}\n` +
          `Convert each to: uses: <action>@<40-char-sha> # <tag>`,
      ).toEqual([]);
    });
  });

  describe("Scenario: every SHA-pinned use carries a tag-as-comment", () => {
    it("a `# vN` (or similar) comment is preserved alongside each SHA pin", () => {
      const refs = collectUsesRefs().filter((r) => r.sha);
      const missingComment = refs.filter((r) => !r.tagComment);
      const message = missingComment
        .map((v) => `  ${v.file}:${v.lineNumber} → ${v.raw.trim()}`)
        .join("\n");

      expect(
        missingComment,
        `Found ${missingComment.length} SHA-pinned use(s) without tag-as-comment:\n${message}\n` +
          `Format must be: uses: <action>@<sha> # <tag>`,
      ).toEqual([]);
    });
  });

  describe("Scenario: OIDC trusted publishing preserved (no NPM_TOKEN regression)", () => {
    it("release.yml retains the OIDC registry-url and no workflow uses NPM_TOKEN/NODE_AUTH_TOKEN as a secret", () => {
      const allWorkflows = listWorkflowFiles().map((p) => ({
        path: p.replace(`${repoRoot}/`, ""),
        content: readFileSync(p, "utf8"),
      }));

      // release.yml is the only workflow that publishes. The OIDC
      // registry-url is required there; ci.yml runs build/test and does
      // not need it.
      const releaseYml = allWorkflows.find((w) => w.path.endsWith("release.yml"));
      expect(releaseYml, "release.yml not found in .github/workflows/").toBeDefined();
      expect(
        releaseYml!.content.includes("registry-url: https://registry.npmjs.org"),
        `release.yml must keep "registry-url: https://registry.npmjs.org" — OIDC trusted publishing depends on it`,
      ).toBe(true);

      // Strip comment-only lines so a comment documenting the absence of
      // NPM_TOKEN doesn't trigger the regression check. Then look for
      // actual secret-reference syntax across every workflow.
      const stripComments = (yml: string) =>
        yml
          .split(/\r?\n/)
          .filter((line) => !/^\s*#/.test(line))
          .join("\n");
      const secretRef = /\$\{\{[^}]*NPM_TOKEN[^}]*\}\}|^\s*NPM_TOKEN:/m;
      const nodeAuthRef = /\$\{\{[^}]*NODE_AUTH_TOKEN[^}]*\}\}|^\s*NODE_AUTH_TOKEN:/m;

      for (const { path, content } of allWorkflows) {
        const stripped = stripComments(content);
        expect(
          secretRef.test(stripped),
          `${path} must not reference NPM_TOKEN as a secret/env (OIDC trusted publishing is the only auth path)`,
        ).toBe(false);
        expect(
          nodeAuthRef.test(stripped),
          `${path} must not reference NODE_AUTH_TOKEN as a secret/env`,
        ).toBe(false);
      }
    });
  });
});
