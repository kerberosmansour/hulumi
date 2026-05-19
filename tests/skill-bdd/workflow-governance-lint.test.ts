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
