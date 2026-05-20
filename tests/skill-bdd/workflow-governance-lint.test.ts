import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..");
const scriptPath = resolve(repoRoot, "scripts", "workflow-governance-lint.mjs");
const SHA = "0123456789abcdef0123456789abcdef01234567";

let tempDirs: string[] = [];

function makeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "hulumi-workflow-governance-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, ".github", "workflows"), { recursive: true });
  return dir;
}

function runLinter(root: string) {
  return spawnSync(process.execPath, [scriptPath, "--repo-root", root], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("workflow-governance linter", () => {
  it("reports full-length SHA pinning, minimum permissions, and CODEOWNERS failures", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, ".github", "workflows", "deploy.yml"),
      [
        "name: deploy",
        "permissions:",
        "  contents: write",
        "jobs:",
        "  deploy:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v6",
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "CODEOWNERS"), "/src/ @app-team\n");

    const result = runLinter(fixture);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain("WF_SHA_1_FULL_LENGTH_SHA_PIN");
    expect(output).toContain("WF_PERM_1_MINIMUM_GITHUB_TOKEN_PERMISSIONS");
    expect(output).toContain("WF_CODEOWNERS_1_WORKFLOWS_PROTECTED");
  });

  it("passes a workflow with SHA-pinned external uses, narrow permissions, and CODEOWNERS coverage", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, ".github", "workflows", "deploy.yml"),
      [
        "name: deploy",
        "permissions:",
        "  contents: read",
        "  id-token: write",
        "jobs:",
        "  deploy:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        `      - uses: actions/checkout@${SHA} # v6`,
        `      - uses: hulumi/example/.github/workflows/deploy.yml@${SHA} # v1`,
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "CODEOWNERS"), "/.github/workflows/ @security-team\n");

    const result = runLinter(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("workflow-governance: pass");
  });

  it("flags a workflow_dispatch job that assumes an AWS role without a protected environment (WF_ENV_1)", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, ".github", "workflows", "cleanup.yml"),
      [
        "name: cleanup",
        "on:",
        "  workflow_dispatch:",
        "permissions:",
        "  id-token: write",
        "  contents: read",
        "jobs:",
        "  cleanup:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        `      - uses: actions/checkout@${SHA} # v6`,
        `      - uses: aws-actions/configure-aws-credentials@${SHA} # v6`,
        "        with:",
        "          role-to-assume: arn:aws:iam::123456789012:role/cleanup",
        "          aws-region: us-east-1",
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "CODEOWNERS"), "/.github/workflows/ @security-team\n");

    const result = runLinter(fixture);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain("WF_ENV_1_DISPATCH_PRIVILEGED_JOB_REQUIRES_ENVIRONMENT");
    expect(output).toContain("cleanup.yml");
    expect(output).toContain("'cleanup'");
  });

  it("flags a workflow_dispatch job that runs `pulumi destroy` without a protected environment (WF_ENV_1)", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, ".github", "workflows", "teardown.yml"),
      [
        "name: teardown",
        "on:",
        "  workflow_dispatch:",
        "permissions:",
        "  id-token: write",
        "  contents: read",
        "jobs:",
        "  teardown:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        `      - uses: actions/checkout@${SHA} # v6`,
        "      - run: pulumi destroy --yes",
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "CODEOWNERS"), "/.github/workflows/ @security-team\n");

    const result = runLinter(fixture);
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status).toBe(1);
    expect(output).toContain("WF_ENV_1_DISPATCH_PRIVILEGED_JOB_REQUIRES_ENVIRONMENT");
  });

  it("passes when a workflow_dispatch privileged job declares a protected environment (WF_ENV_1)", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, ".github", "workflows", "cleanup.yml"),
      [
        "name: cleanup",
        "on:",
        "  workflow_dispatch:",
        "permissions:",
        "  id-token: write",
        "  contents: read",
        "jobs:",
        "  cleanup:",
        "    runs-on: ubuntu-latest",
        "    environment: aws-cleanup",
        "    steps:",
        `      - uses: actions/checkout@${SHA} # v6`,
        `      - uses: aws-actions/configure-aws-credentials@${SHA} # v6`,
        "        with:",
        "          role-to-assume: arn:aws:iam::123456789012:role/cleanup",
        "          aws-region: us-east-1",
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "CODEOWNERS"), "/.github/workflows/ @security-team\n");

    const result = runLinter(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("workflow-governance: pass");
  });

  it("does not flag workflows without workflow_dispatch even if they assume AWS roles (WF_ENV_1)", () => {
    const fixture = makeFixture();
    writeFileSync(
      join(fixture, ".github", "workflows", "scheduled.yml"),
      [
        "name: scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 4 * * 0"',
        "permissions:",
        "  id-token: write",
        "  contents: read",
        "jobs:",
        "  job:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        `      - uses: actions/checkout@${SHA} # v6`,
        `      - uses: aws-actions/configure-aws-credentials@${SHA} # v6`,
        "        with:",
        "          role-to-assume: arn:aws:iam::123456789012:role/scheduled",
        "          aws-region: us-east-1",
        "",
      ].join("\n"),
    );
    writeFileSync(join(fixture, "CODEOWNERS"), "/.github/workflows/ @security-team\n");

    const result = runLinter(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("workflow-governance: pass");
  });
});

// =============================================================================
// WF_ENV_1 settings-state verification (ticket-183, opt-in via --check-settings
// or { checkSettings: true } JS-API option). Direct JS-API tests with a
// stubbable resolver — no spawn, no real `gh` calls.
// =============================================================================

// workflow-governance-lint.mjs is plain JS without a `.d.ts`. The runtime
// contract is documented in JSDoc on the .mjs export and exercised by the
// BDD tests below. Dynamic import + a local type assertion keeps the TS
// compiler happy without adding a declaration file outside this ticket's
// allow-list and without an unused `@ts-expect-error` directive.
type WfgModule = {
  WF_ENV_1_RULE_ID: string;
  collectWorkflowGovernanceDiagnosticsAsync: (options: {
    repoRoot?: string;
    checkSettings?: boolean;
    resolveEnvironment?: (
      name: string,
    ) => Promise<{ name: string; protection_rules: Array<{ type: string }> } | null>;
  }) => Promise<Array<{ ruleId: string; file: string; line: number; message: string }>>;
};
// @ts-ignore — .mjs has no .d.ts; runtime contract documented in JSDoc on the export
const wfg = (await import("../../scripts/workflow-governance-lint.mjs")) as unknown as WfgModule;
const { collectWorkflowGovernanceDiagnosticsAsync, WF_ENV_1_RULE_ID } = wfg;

type EnvironmentSettings = {
  name: string;
  protection_rules: Array<{ type: string }>;
};

function writePrivilegedWorkflow(fixture: string, filename: string, envName: string): void {
  writeFileSync(
    join(fixture, ".github", "workflows", filename),
    [
      "name: privileged",
      "on:",
      "  workflow_dispatch:",
      "",
      "permissions:",
      "  contents: read",
      "",
      "jobs:",
      "  destroy:",
      "    runs-on: ubuntu-latest",
      `    environment: ${envName}`,
      "    steps:",
      `      - uses: aws-actions/configure-aws-credentials@${SHA} # v4`,
      "      - run: pulumi destroy",
      "",
    ].join("\n"),
  );
  writeFileSync(join(fixture, "CODEOWNERS"), "/.github/workflows/ @security-team\n");
}

describe("WF_ENV_1 settings-state verification (--check-settings)", () => {
  it("does NOT change behavior when checkSettings is unset (default-off)", async () => {
    const fixture = makeFixture();
    writePrivilegedWorkflow(fixture, "destroy.yml", "good-env");
    const diagnostics = await collectWorkflowGovernanceDiagnosticsAsync({
      repoRoot: fixture,
    });
    // Pre-existing structural WF_ENV_1 not triggered (env declared); no
    // settings-check diagnostic added (checkSettings unset).
    expect(diagnostics.filter((d: { ruleId: string }) => d.ruleId === WF_ENV_1_RULE_ID)).toEqual(
      [],
    );
  });

  it("passes when every privileged-job env is configured WITH protection rules", async () => {
    const fixture = makeFixture();
    writePrivilegedWorkflow(fixture, "destroy.yml", "good-env");
    const resolveEnvironment = async (name: string): Promise<EnvironmentSettings | null> => {
      if (name === "good-env") {
        return { name, protection_rules: [{ type: "required_reviewers" }] };
      }
      return null;
    };
    const diagnostics = await collectWorkflowGovernanceDiagnosticsAsync({
      repoRoot: fixture,
      checkSettings: true,
      resolveEnvironment,
    });
    expect(diagnostics.filter((d: { ruleId: string }) => d.ruleId === WF_ENV_1_RULE_ID)).toEqual(
      [],
    );
  });

  it("flags WF_ENV_1 when a YAML-referenced env is NOT configured in repo settings (resolver returns null)", async () => {
    const fixture = makeFixture();
    writePrivilegedWorkflow(fixture, "destroy.yml", "missing-env");
    const resolveEnvironment = async (_name: string): Promise<EnvironmentSettings | null> => null;
    const diagnostics = await collectWorkflowGovernanceDiagnosticsAsync({
      repoRoot: fixture,
      checkSettings: true,
      resolveEnvironment,
    });
    const envDiags = diagnostics.filter((d: { ruleId: string }) => d.ruleId === WF_ENV_1_RULE_ID);
    expect(envDiags).toHaveLength(1);
    expect(envDiags[0].message).toContain("missing-env");
    expect(envDiags[0].message).toMatch(/not configured in repo settings/);
  });

  it("flags WF_ENV_1 when an env is configured but has ZERO protection rules", async () => {
    const fixture = makeFixture();
    writePrivilegedWorkflow(fixture, "destroy.yml", "open-env");
    const resolveEnvironment = async (name: string): Promise<EnvironmentSettings | null> => ({
      name,
      protection_rules: [],
    });
    const diagnostics = await collectWorkflowGovernanceDiagnosticsAsync({
      repoRoot: fixture,
      checkSettings: true,
      resolveEnvironment,
    });
    const envDiags = diagnostics.filter((d: { ruleId: string }) => d.ruleId === WF_ENV_1_RULE_ID);
    expect(envDiags).toHaveLength(1);
    expect(envDiags[0].message).toContain("open-env");
    expect(envDiags[0].message).toMatch(/zero protection rules/);
  });

  it("surfaces resolver errors as diagnostics, not silent passes", async () => {
    const fixture = makeFixture();
    writePrivilegedWorkflow(fixture, "destroy.yml", "broken-resolver");
    const resolveEnvironment = async (_name: string): Promise<EnvironmentSettings | null> => {
      throw new Error("gh auth required");
    };
    const diagnostics = await collectWorkflowGovernanceDiagnosticsAsync({
      repoRoot: fixture,
      checkSettings: true,
      resolveEnvironment,
    });
    const envDiags = diagnostics.filter((d: { ruleId: string }) => d.ruleId === WF_ENV_1_RULE_ID);
    expect(envDiags).toHaveLength(1);
    expect(envDiags[0].message).toContain("broken-resolver");
    expect(envDiags[0].message).toMatch(/gh auth required/);
  });

  it("throws a helpful Error if checkSettings is true but no resolver is provided", async () => {
    const fixture = makeFixture();
    writePrivilegedWorkflow(fixture, "destroy.yml", "any-env");
    await expect(
      collectWorkflowGovernanceDiagnosticsAsync({
        repoRoot: fixture,
        checkSettings: true,
      }),
    ).rejects.toThrow(/resolveEnvironment/);
  });

  it("memoizes resolver calls per env name within one invocation", async () => {
    const fixture = makeFixture();
    // Two workflows both declare environment: shared-env on privileged jobs.
    writePrivilegedWorkflow(fixture, "destroy-a.yml", "shared-env");
    writePrivilegedWorkflow(fixture, "destroy-b.yml", "shared-env");
    let calls = 0;
    const resolveEnvironment = async (name: string): Promise<EnvironmentSettings | null> => {
      calls += 1;
      return { name, protection_rules: [{ type: "required_reviewers" }] };
    };
    await collectWorkflowGovernanceDiagnosticsAsync({
      repoRoot: fixture,
      checkSettings: true,
      resolveEnvironment,
    });
    expect(calls).toBe(1); // memoization — same env queried only once
  });
});
