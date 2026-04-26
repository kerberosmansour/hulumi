// Behavioural tests for the /hulumi-threat-model Claude Code skill.
// Each test corresponds to one row of the BDD Acceptance Scenarios table in
// docs/runbook-milestones/hulumi-m1.md. Do not reshape the scenario table
// here — the runbook's table is the contract.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, readFile, rm, writeFile, readdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Paths — all tests reference the live skill at its repo-relative path.
const REPO_ROOT = resolve(__dirname, "../..");
const SKILL_DIR = join(REPO_ROOT, "skills", "hulumi-threat-model");
const SCRIPTS_DIR = join(SKILL_DIR, "scripts");
const MAPPINGS_DIR = join(REPO_ROOT, "docs", "mappings");
const FIXTURES_DIR = resolve(__dirname, "_fixtures");

// The generator + lister are dynamically imported inside each test so that
// tests which run before implementation exists fail for the right reason
// (module not found) rather than at import-time crash.
async function importGenerator(): Promise<
  (opts: {
    scenario: string;
    scenariosDir: string;
    mappingsDir: string;
    templatesDir: string;
    outputDir: string;
    nowIso?: string;
  }) => Promise<{ path: string; content: string }>
> {
  const mod = await import(/* @vite-ignore */ join(SCRIPTS_DIR, "generate-threat-model.mjs"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).generateThreatModel;
}

async function importLister(): Promise<() => string[]> {
  const mod = await import(/* @vite-ignore */ join(SCRIPTS_DIR, "list-scenarios.mjs"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mod as any).listScenarios;
}

async function makeTmpOutputDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "hulumi-m1-test-"));
}

describe("Feature: /hulumi-threat-model produces framework-ID-cited threat-model markdown", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmpOutputDir();
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("[happy path] AWS multi-account baseline emits a markdown with framework citations and no verbatim prose", async () => {
    const generate = await importGenerator();
    const { path, content } = await generate({
      scenario: "aws-multi-account-baseline",
      scenariosDir: join(SKILL_DIR, "scenarios"),
      mappingsDir: MAPPINGS_DIR,
      templatesDir: join(SKILL_DIR, "templates"),
      outputDir: tmp,
    });

    // File at the expected path
    expect(path).toMatch(/docs\/threat-model-aws-multi-account-baseline-\d{8}\.md$/);
    const onDisk = await readFile(path, "utf8");
    expect(onDisk).toBe(content);

    // Frontmatter present with required fields
    expect(content).toMatch(/^---\nname: threat-model-aws-multi-account-baseline\n/);
    expect(content).toMatch(/\nscenario: aws-multi-account-baseline\n/);
    expect(content).toMatch(/\ngenerated_at: \d{4}-\d{2}-\d{2}T/);
    expect(content).toMatch(
      /\ncitations:\n(?: {2}- framework: \w[\w-]*\n {4}id: \S+\n {4}url: https?:\/\/[^\n]+\n)+/,
    );

    // ≥ 5 framework ID citations, at least one each from CCM, NIST 800-53, ATLAS, CIS
    const citationFrameworks = Array.from(content.matchAll(/^ {2}- framework: (\S+)/gm)).map(
      (m) => m[1],
    );
    expect(citationFrameworks.length).toBeGreaterThanOrEqual(5);
    expect(citationFrameworks).toContain("CCM");
    expect(citationFrameworks).toContain("NIST-800-53-r5");
    expect(citationFrameworks).toContain("ATLAS");
    expect(citationFrameworks).toContain("CIS-AWS-v5.0.0");

    // ≥ 3 scenario-specific STRIDE rows (section exists and has a table with
    // at least 3 data rows; the STRIDE header row and the separator line don't
    // count).
    const strideSection = content.match(/## Threats \(STRIDE\)\n([\s\S]*?)\n## /)?.[1] ?? "";
    const strideDataRows = strideSection.split("\n").filter((l) => /^\| [^|]/.test(l));
    expect(strideDataRows.length).toBeGreaterThanOrEqual(3 + 1); // +1 for header

    // ≥ 2 "Recommended Hulumi Components" forward-references
    const componentsSection =
      content.match(/## Recommended Hulumi Components\n([\s\S]*?)\n## /)?.[1] ?? "";
    const bullets = componentsSection.split("\n").filter((l) => l.trim().startsWith("-"));
    expect(bullets.length).toBeGreaterThanOrEqual(2);

    // Zero verbatim CCM / CIS control text (known-distinctive fragments from
    // the repo's license-boundary-lint fixture list).
    const knownVerbatim = [
      "A policy and procedures for cryptographic",
      "The organization shall establish, document",
      "This Benchmark provides prescriptive guidance",
    ];
    for (const fragment of knownVerbatim) {
      expect(content.toLowerCase()).not.toContain(fragment.toLowerCase());
    }
  });

  it("[invalid input] empty scenario argument lists scenarios and returns exit 1", async () => {
    // CLI mode — invoked by `node scripts/generate-threat-model.mjs` with no args.
    const res = spawnSync(process.execPath, [join(SCRIPTS_DIR, "generate-threat-model.mjs")], {
      encoding: "utf8",
      cwd: tmp,
    });
    expect(res.status).toBe(1);
    const combined = (res.stdout || "") + (res.stderr || "");
    expect(combined).toMatch(/Usage:|scenarios:/i);
    for (const s of [
      "aws-multi-account-baseline",
      "s3-public-bucket-hardening",
      "iam-least-privilege",
      "rds-encryption-at-rest",
      "lambda-secrets-access",
    ]) {
      expect(combined).toContain(s);
    }
    // No file was written in cwd
    const written = await readdir(tmp);
    expect(written).toEqual([]);
  });

  it("[invalid input] unknown scenario writes nothing and returns exit 1", async () => {
    const res = spawnSync(
      process.execPath,
      [join(SCRIPTS_DIR, "generate-threat-model.mjs"), "unknown-scenario-foo"],
      { encoding: "utf8", cwd: tmp },
    );
    expect(res.status).toBe(1);
    const combined = (res.stdout || "") + (res.stderr || "");
    expect(combined).toMatch(/unknown|not found|valid scenarios/i);
    const written = await readdir(tmp);
    expect(written).toEqual([]);
  });

  it("[empty state] scenario referencing a framework with no mappings emits open-questions, does not fabricate IDs", async () => {
    // Build a synthetic scenario on the fly in a temp scenarios dir + temp
    // mappings dir that deliberately contains an empty mapping for one framework.
    const generate = await importGenerator();
    const synthScenariosDir = join(tmp, "scenarios");
    const synthMappingsDir = join(tmp, "mappings");
    const synthTemplatesDir = join(SKILL_DIR, "templates");
    await fs.mkdir(synthScenariosDir, { recursive: true });
    await fs.mkdir(synthMappingsDir, { recursive: true });

    // Synthetic scenario with one framework whose mapping table is empty.
    await writeFile(
      join(synthScenariosDir, "synthetic-empty.json"),
      JSON.stringify({
        id: "synthetic-empty",
        title: "Synthetic empty-mappings test",
        description: "Test scenario forcing an empty-mapping branch.",
        actors: ["SyntheticActor"],
        assets: ["SyntheticAsset"],
        stride: [
          { type: "S", name: "Spoof", description: "spoof", controls: ["OnlyInSyntheticEmpty"] },
          { type: "T", name: "Tamper", description: "tamper", controls: [] },
          { type: "I", name: "InfoDisc", description: "info disc", controls: [] },
        ],
        requiredFrameworks: ["SYNTHETIC-EMPTY"],
      }),
    );
    // Create an empty SYNTHETIC-EMPTY mapping table so the skill has a
    // frame to look up but finds nothing.
    await writeFile(
      join(synthMappingsDir, "synthetic-empty.md"),
      "# SYNTHETIC-EMPTY framework\n\n| id | title | url |\n|---|---|---|\n",
    );

    const { content } = await generate({
      scenario: "synthetic-empty",
      scenariosDir: synthScenariosDir,
      mappingsDir: synthMappingsDir,
      templatesDir: synthTemplatesDir,
      outputDir: tmp,
    });

    // Open Questions section explicitly names the framework and marks
    // "Requires further research" — no fabricated IDs.
    expect(content).toMatch(
      /## Open Questions\n[\s\S]*SYNTHETIC-EMPTY[\s\S]*Requires further research/,
    );
    // No fake framework-ID citations for the empty framework.
    const matches = content.matchAll(/framework: SYNTHETIC-EMPTY\n {4}id: (\S+)/g);
    expect(Array.from(matches)).toEqual([]);
  });

  it("[partial failure] mapping file unreadable falls back to bundled stubs, emits warning, exits zero", async () => {
    // Simulate a mappings dir where the CCM file is not readable. The script
    // must use its bundled-in-package CCM stub and emit a clear warning on
    // stderr; it must exit 0 (not crash).
    const synthMappingsDir = join(tmp, "mappings");
    await fs.mkdir(synthMappingsDir, { recursive: true });
    // Create a CCM file, then chmod 000 so the reader gets EACCES.
    const ccmPath = join(synthMappingsDir, "ccm-v4.1.md");
    await writeFile(ccmPath, "# placeholder\n");
    await chmod(ccmPath, 0o000);

    const res = spawnSync(
      process.execPath,
      [
        join(SCRIPTS_DIR, "generate-threat-model.mjs"),
        "aws-multi-account-baseline",
        "--mappings-dir",
        synthMappingsDir,
        "--output-dir",
        tmp,
      ],
      { encoding: "utf8", cwd: tmp },
    );

    // Restore perms so the afterEach cleanup can remove the file.
    await chmod(ccmPath, 0o600).catch(() => {});

    expect(res.status).toBe(0);
    const stderr = res.stderr || "";
    expect(stderr).toMatch(/warning|fallback|bundled/i);
    expect(stderr).toContain("ccm-v4.1.md");

    // Output still produced in <outputDir>/docs/threat-model-*.md.
    const docsDir = join(tmp, "docs");
    const files = await readdir(docsDir).catch(() => [] as string[]);
    expect(files.some((f) => f.startsWith("threat-model-aws-multi-account-baseline-"))).toBe(true);
  });

  it("[license boundary] skill's SKILL.md documents IDs-only refusal and points at CSA licensing FAQ", async () => {
    // The skill's verbatim-refusal behaviour is enforced by two layers:
    //   (a) SKILL.md instructions to the agent (documented, behavioural)
    //   (b) Post-facto license-boundary-lint on outputs/source (deterministic)
    // This test validates (a): the SKILL.md carries the refusal instruction
    // and the CSA licensing FAQ URL. Layer (b) is tested in the
    // "IDs-only lint catches seeded prose" test below.
    const skillMd = await readFile(join(SKILL_DIR, "SKILL.md"), "utf8");
    expect(skillMd).toMatch(/refuse politely/i);
    expect(skillMd).toMatch(/IDs only/i);
    expect(skillMd).toContain("https://cloudsecurityalliance.org/artifacts/ccm-aicm-licensing-faq");
  });

  it("[schema compatibility] output markdown frontmatter has name, scenario, generated_at (ISO8601), citations[] with non-empty urls", async () => {
    const generate = await importGenerator();
    const { content } = await generate({
      scenario: "s3-public-bucket-hardening",
      scenariosDir: join(SKILL_DIR, "scenarios"),
      mappingsDir: MAPPINGS_DIR,
      templatesDir: join(SKILL_DIR, "templates"),
      outputDir: tmp,
    });

    // Extract frontmatter block
    const fm = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
    expect(fm).toBeDefined();
    expect(fm).toMatch(/^name: threat-model-s3-public-bucket-hardening\b/m);
    expect(fm).toMatch(/^scenario: s3-public-bucket-hardening\b/m);
    expect(fm).toMatch(/^generated_at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?\+?[\d:]*\b/m);

    // Every citation has a non-empty url starting with http
    const urls = Array.from(fm!.matchAll(/\n {4}url: (\S+)/g)).map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https?:\/\//);
    }
  });

  it("[security S1] README documents a canonical install path (single GitHub org + hulumi + attestation-verify reference)", async () => {
    const readme = await readFile(join(REPO_ROOT, "README.md"), "utf8");
    expect(readme).toMatch(/## Canonical install\n/);
    // Exactly one canonical repo path — capture all org/hulumi patterns and
    // assert they all resolve to the same canonical path.
    const canonicalMatches = Array.from(readme.matchAll(/github\.com\/([\w-]+)\/hulumi\b/g));
    expect(canonicalMatches.length).toBeGreaterThan(0);
    const uniqueOrgs = new Set(canonicalMatches.map((m) => m[1]));
    expect(uniqueOrgs.size).toBe(1);
    // README must reference attestation verification as part of the canonical
    // install guidance (precise pinned SHA lands in M5 but the reference to
    // the verification exists in M1).
    expect(readme).toMatch(/attestation|Pinned v1\.0\.0 commit SHA/i);
  });

  it("[IDs-only lint — seeded prose] copying a known CCM verbatim fragment into skills/ fails the lint; removing it passes", async () => {
    const seeded = await readFile(join(FIXTURES_DIR, "known-ccm-verbatim.md"), "utf8");
    const target = join(SKILL_DIR, ".lint-fixture-verbatim.md");
    await writeFile(target, seeded);
    const fail = spawnSync("node", [join(REPO_ROOT, "scripts/license-boundary-lint.mjs")], {
      encoding: "utf8",
    });
    await rm(target, { force: true });
    expect(fail.status).toBe(1);
    expect(fail.stderr).toMatch(/license-boundary-lint: FAIL/);

    const pass = spawnSync("node", [join(REPO_ROOT, "scripts/license-boundary-lint.mjs")], {
      encoding: "utf8",
    });
    expect(pass.status).toBe(0);
    expect(pass.stdout).toMatch(/license-boundary-lint: OK/);
  });

  it("[happy path] lister returns the nine prebuilt scenario IDs in declared order (5 AWS + 4 GitHub)", async () => {
    const list = await importLister();
    const ids = list();
    expect(ids).toEqual([
      "aws-multi-account-baseline",
      "s3-public-bucket-hardening",
      "iam-least-privilege",
      "rds-encryption-at-rest",
      "lambda-secrets-access",
      "github-oidc-trust-cloud-account",
      "github-actions-supply-chain",
      "github-app-token-exposure",
      "github-self-hosted-runner",
    ]);
  });
});

// Tests below correspond to the BDD Acceptance Scenarios table in
// docs/runbook-milestones/hulumi-github-m1.md. Do not reshape the scenario
// table here — the runbook's table is the contract.
describe("Feature: /hulumi-threat-model produces framework-ID-cited threat-model markdown for GitHub scenarios", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmpOutputDir();
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("[happy path] OIDC trust scenario emits ≥5 framework citations spanning the GitHub-specific frameworks", async () => {
    const generate = await importGenerator();
    const { path, content } = await generate({
      scenario: "github-oidc-trust-cloud-account",
      scenariosDir: join(SKILL_DIR, "scenarios"),
      mappingsDir: MAPPINGS_DIR,
      templatesDir: join(SKILL_DIR, "templates"),
      outputDir: tmp,
    });
    expect(path).toMatch(/docs\/threat-model-github-oidc-trust-cloud-account-\d{8}\.md$/);

    const onDisk = await readFile(path, "utf8");
    expect(onDisk).toBe(content);

    // Frontmatter shape lock
    expect(content).toMatch(/^---\nname: threat-model-github-oidc-trust-cloud-account\n/);
    expect(content).toMatch(/\nscenario: github-oidc-trust-cloud-account\n/);
    expect(content).toMatch(/\ngenerated_at: \d{4}-\d{2}-\d{2}T/);

    // ≥5 distinct framework IDs spanning the named GitHub-specific frameworks.
    // Exact framework prefixes used in M1 GitHub scenarios:
    const citationFrameworks = Array.from(content.matchAll(/^ {2}- framework: (\S+)/gm)).map(
      (m) => m[1],
    );
    expect(citationFrameworks.length).toBeGreaterThanOrEqual(5);
    expect(citationFrameworks).toContain("CIS-GitHub-v1.2.0");
    expect(citationFrameworks).toContain("NIST-SSDF-v1.1");
    expect(citationFrameworks).toContain("OpenSSF-Scorecard");
    expect(citationFrameworks).toContain("MITRE-ATTCK");
    expect(citationFrameworks).toContain("GitHub-Well-Architected");

    // ≥3 STRIDE rows.
    const strideSection = content.match(/## Threats \(STRIDE\)\n([\s\S]*?)\n## /)?.[1] ?? "";
    const strideDataRows = strideSection.split("\n").filter((l) => /^\| [^|]/.test(l));
    expect(strideDataRows.length).toBeGreaterThanOrEqual(3 + 1); // +1 for header

    // ≥1 forward-reference to OrgFoundation (M2) — the OIDC trust scenario
    // explicitly recommends OrgFoundation as the IaC home for the sub claim
    // template.
    expect(content).toContain("OrgFoundation");
  });

  it("[happy path] all 4 GitHub scenarios produce valid markdown; no two outputs identical", async () => {
    const generate = await importGenerator();
    const ids = [
      "github-oidc-trust-cloud-account",
      "github-actions-supply-chain",
      "github-app-token-exposure",
      "github-self-hosted-runner",
    ];
    /** @type {string[]} */
    const contents: string[] = [];
    for (const id of ids) {
      const { content } = await generate({
        scenario: id,
        scenariosDir: join(SKILL_DIR, "scenarios"),
        mappingsDir: MAPPINGS_DIR,
        templatesDir: join(SKILL_DIR, "templates"),
        outputDir: tmp,
      });
      // Each output has the structural assertions from the OIDC happy path.
      expect(content).toMatch(/^---\nname: threat-model-/);
      const citationFrameworks = Array.from(content.matchAll(/^ {2}- framework: (\S+)/gm)).map(
        (m) => m[1],
      );
      expect(citationFrameworks.length).toBeGreaterThanOrEqual(5);
      const strideSection = content.match(/## Threats \(STRIDE\)\n([\s\S]*?)\n## /)?.[1] ?? "";
      const strideDataRows = strideSection.split("\n").filter((l) => /^\| [^|]/.test(l));
      expect(strideDataRows.length).toBeGreaterThanOrEqual(3 + 1);
      contents.push(content);
    }
    // No two outputs identical — distinct scenarios produce distinct documents.
    const unique = new Set(contents);
    expect(unique.size).toBe(ids.length);
  });

  it("[abuse: license boundary] SKILL.md GitHub-side refusal contract carries forward — refuses verbatim CIS GitHub Benchmark text", async () => {
    // SKILL.md's IDs-only-and-refuse contract applies uniformly to AWS + GitHub
    // scenarios. tm-hulumi-github-abuse-license-boundary.
    const skillMd = await readFile(join(SKILL_DIR, "SKILL.md"), "utf8");
    expect(skillMd).toMatch(/refuse politely/i);
    expect(skillMd).toMatch(/IDs only/i);
    // The refusal contract must carry forward to GitHub-specific frameworks.
    // We assert the SKILL.md mentions either the CIS Benchmarks license
    // posture or specifically references the GitHub variant.
    expect(skillMd.toLowerCase()).toMatch(
      /cis benchmarks?|cis github|cis aws|license posture|cc by-nc-sa/,
    );
  });

  it("[abuse: scenario-id traversal] path-traversal scenario ID is rejected via allow-list (no file is read outside scenarios/)", async () => {
    // tm-hulumi-github-abuse-scenario-id-traversal: the skill must refuse
    // traversal-shape scenario IDs without ever attempting to read files.
    const res = spawnSync(
      process.execPath,
      [join(SCRIPTS_DIR, "generate-threat-model.mjs"), "../../etc/passwd"],
      { encoding: "utf8", cwd: tmp },
    );
    expect(res.status).toBe(1);
    const combined = (res.stdout || "") + (res.stderr || "");
    expect(combined).toMatch(/unknown|not found|valid scenarios/i);
    // No file was written and nothing leaked from the traversal target.
    const written = await readdir(tmp);
    expect(written).toEqual([]);
    expect(combined).not.toMatch(/root:|nobody:/); // /etc/passwd content shape
  });

  it("[schema compatibility] GitHub scenario output frontmatter passes the same schema as AWS scenarios", async () => {
    const generate = await importGenerator();
    const { content } = await generate({
      scenario: "github-actions-supply-chain",
      scenariosDir: join(SKILL_DIR, "scenarios"),
      mappingsDir: MAPPINGS_DIR,
      templatesDir: join(SKILL_DIR, "templates"),
      outputDir: tmp,
    });
    const fm = content.match(/^---\n([\s\S]*?)\n---\n/)?.[1];
    expect(fm).toBeDefined();
    expect(fm).toMatch(/^name: threat-model-github-actions-supply-chain\b/m);
    expect(fm).toMatch(/^scenario: github-actions-supply-chain\b/m);
    expect(fm).toMatch(/^generated_at: \d{4}-\d{2}-\d{2}T/m);
    const urls = Array.from(fm!.matchAll(/\n {4}url: (\S+)/g)).map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https?:\/\//);
    }
  });
});
