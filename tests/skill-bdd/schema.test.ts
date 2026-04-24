// Schema-level validation of skills/hulumi-threat-model/SKILL.md.
//
// The agentskills.io spec as of 2026-04-24 requires:
//   - YAML frontmatter delimited by `---` on its own line
//   - `name` (kebab-case)
//   - `description` (non-empty)
//   - Optional: `allowed-tools` (array of Claude Code tool names)
//   - Optional: `paths` (array of glob patterns)
//   - Optional: `arguments` (array of { name, description, required? })
//   - Optional: `disable-model-invocation`, `hooks`, `context`
//
// We don't pull a full YAML parser as a test-only dep for M1 — the frontmatter
// fields we assert on are plain line-regex-checkable. If we need deeper
// validation we add a YAML parser with a documented rationale.

import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const SKILL_MD = resolve(__dirname, "../../skills/hulumi-threat-model/SKILL.md");

describe("SKILL.md frontmatter matches agentskills.io contract (2026-04-24)", () => {
  it("starts with a frontmatter block delimited by ---", async () => {
    const raw = await readFile(SKILL_MD, "utf8");
    expect(raw.startsWith("---\n")).toBe(true);
    expect(raw).toMatch(/\n---\n/);
  });

  it("has a kebab-case `name` matching the folder name", async () => {
    const raw = await readFile(SKILL_MD, "utf8");
    expect(raw).toMatch(/\nname: hulumi-threat-model\n/);
  });

  it("has a non-empty `description`", async () => {
    const raw = await readFile(SKILL_MD, "utf8");
    // description can be multi-line with `>` folding
    const m = raw.match(/\ndescription:\s*(?:>[\s\S]*?\n\S|(.+))/);
    expect(m).toBeTruthy();
  });

  it("lists `allowed-tools`", async () => {
    const raw = await readFile(SKILL_MD, "utf8");
    expect(raw).toMatch(/\nallowed-tools:\n(?: {2}- \w+\n)+/);
  });

  it("declares the `scenario` required positional argument", async () => {
    const raw = await readFile(SKILL_MD, "utf8");
    expect(raw).toMatch(/\narguments:\n[\s\S]*- name: scenario[\s\S]*required: true/);
  });

  it("declares `paths` globs", async () => {
    const raw = await readFile(SKILL_MD, "utf8");
    expect(raw).toMatch(/\npaths:\n(?: {2}- "[^"\n]+"\n)+/);
  });

  it("frontmatter closes with a bare `---` line before the body", async () => {
    const raw = await readFile(SKILL_MD, "utf8");
    const close = raw.indexOf("\n---\n", 4);
    expect(close).toBeGreaterThan(0);
    // Body starts after the close
    expect(raw.slice(close + 5).trim().length).toBeGreaterThan(0);
  });
});

describe("skill-folder layout", () => {
  const SKILL_DIR = resolve(__dirname, "../../skills/hulumi-threat-model");

  it("has SKILL.md, scripts/, templates/, scenarios/", async () => {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(SKILL_DIR);
    expect(entries).toContain("SKILL.md");
    expect(entries).toContain("scripts");
    expect(entries).toContain("templates");
    expect(entries).toContain("scenarios");
  });

  it("has the 5 prebuilt scenario JSONs", async () => {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(join(SKILL_DIR, "scenarios"));
    const expected = [
      "aws-multi-account-baseline.json",
      "s3-public-bucket-hardening.json",
      "iam-least-privilege.json",
      "rds-encryption-at-rest.json",
      "lambda-secrets-access.json",
    ];
    for (const f of expected) expect(entries).toContain(f);
  });
});
