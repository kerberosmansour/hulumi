import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  renderLiveValidationJson,
  renderLiveValidationMarkdown,
  renderLiveValidationSarif,
  runLiveValidation,
  runLiveValidatorCli,
  type LiveProviderAdapter,
  type LiveValidationFinding,
} from "../src/live-validator";

const FIXED_TIME = "2026-05-27T00:00:00.000Z";

let tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "hulumi-live-validator-"));
  tempDirs.push(dir);
  return dir;
}

function writeConfig(config: unknown): string {
  const path = join(makeTempDir(), "validator.json");
  writeFileSync(path, JSON.stringify(config, null, 2));
  return path;
}

function finding(overrides: Partial<LiveValidationFinding> = {}): LiveValidationFinding {
  return {
    id: "AWS-ORG-1",
    provider: "aws-org",
    severity: "info",
    status: "pass",
    resource: "aws-org:root",
    message: "delegated admin configured",
    evidence: { source: "fixture" },
    observedAt: FIXED_TIME,
    ...overrides,
  };
}

function adapter(
  provider: LiveProviderAdapter["provider"],
  findings: LiveValidationFinding[],
): LiveProviderAdapter {
  return {
    provider,
    run: async () => findings,
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("hulumi validate live", () => {
  it("returns exit 0 and deterministic JSON for clean configured providers", async () => {
    const config = writeConfig({
      schemaVersion: "hulumi.live-validator.config.v1",
      providers: ["aws-org", "pulumi-state", "eks", "github"],
      checks: [
        finding({ id: "AWS-ORG-1", provider: "aws-org" }),
        finding({ id: "STATE-1", provider: "pulumi-state", resource: "pulumi-state:prod" }),
        finding({ id: "EKS-FND-1", provider: "eks", resource: "eks:prod" }),
        finding({ id: "GH-RUNNER-1", provider: "github", resource: "github:repo/prod" }),
      ],
    });

    const result = await runLiveValidatorCli([
      "validate",
      "live",
      "--config",
      config,
      "--format",
      "json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: "hulumi.live-validator.report.v1",
      summary: { total: 4, pass: 4, fail: 0, degraded: 0 },
    });
  });

  it("rejects unknown provider scopes as usage errors", async () => {
    const config = writeConfig({
      schemaVersion: "hulumi.live-validator.config.v1",
      providers: ["aws-org"],
      checks: [finding()],
    });

    const result = await runLiveValidatorCli([
      "validate",
      "live",
      "--config",
      config,
      "--provider",
      "bananas",
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unsupported provider");
  });

  it("fails clearly when no checks are configured", async () => {
    const config = writeConfig({
      schemaVersion: "hulumi.live-validator.config.v1",
      providers: [],
      checks: [],
    });

    const result = await runLiveValidatorCli(["validate", "live", "--config", config]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("no checks configured");
  });

  it("emits degraded findings when a provider times out", async () => {
    const hanging: LiveProviderAdapter = {
      provider: "aws-org",
      run: async (signal) => {
        return new Promise<LiveValidationFinding[]>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
    };

    const report = await runLiveValidation({
      adapters: [hanging],
      timeoutMs: 10,
      maxConcurrency: 1,
      clock: () => FIXED_TIME,
    });

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]).toMatchObject({
      provider: "aws-org",
      status: "degraded",
      severity: "medium",
    });
    expect(report.exitCode).toBe(1);
  });

  it("renders byte-equivalent SARIF for the same findings", () => {
    const report = {
      schemaVersion: "hulumi.live-validator.report.v1" as const,
      generatedAt: FIXED_TIME,
      summary: { total: 1, pass: 0, fail: 1, degraded: 0, skipped: 0 },
      findings: [
        finding({
          id: "LIVE-DRIFT-1",
          provider: "github",
          severity: "high",
          status: "fail",
          resource: "github:repo/prod",
          message: "environment reviewer removed",
        }),
      ],
      exitCode: 1,
    };

    expect(renderLiveValidationSarif(report)).toBe(renderLiveValidationSarif(report));
  });

  it("bounds provider concurrency", async () => {
    let active = 0;
    let maxActive = 0;
    const makeAdapter = (provider: LiveProviderAdapter["provider"]): LiveProviderAdapter => ({
      provider,
      run: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        active -= 1;
        return [finding({ id: `${provider}-1`, provider })];
      },
    });

    await runLiveValidation({
      adapters: [
        makeAdapter("aws-org"),
        makeAdapter("pulumi-state"),
        makeAdapter("eks"),
        makeAdapter("github"),
      ],
      timeoutMs: 1_000,
      maxConcurrency: 2,
      clock: () => FIXED_TIME,
    });

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(maxActive).toBe(2);
  });

  it("does not let crafted names hide findings in JSON, Markdown, or SARIF", () => {
    const crafted = finding({
      id: "CRAFTED-1",
      provider: "github",
      severity: "critical",
      status: "fail",
      resource: "repo|prod\n<script>",
      message: "critical drift\n\\| hidden row",
      evidence: { secretToken: "do-not-print", repo: "repo|prod\n<script>" },
    });
    const report = {
      schemaVersion: "hulumi.live-validator.report.v1" as const,
      generatedAt: FIXED_TIME,
      summary: { total: 1, pass: 0, fail: 1, degraded: 0, skipped: 0 },
      findings: [crafted],
      exitCode: 1,
    };

    const json = renderLiveValidationJson(report);
    const markdown = renderLiveValidationMarkdown(report);
    const sarif = renderLiveValidationSarif(report);

    expect(JSON.parse(json).findings[0].evidence.secretToken).toBe("[redacted]");
    expect(markdown).toContain("repo\\|prod<br>&lt;script&gt;");
    expect(markdown).toContain("critical drift<br>\\\\\\| hidden row");
    expect(sarif).not.toContain("do-not-print");
    expect(JSON.parse(sarif).runs[0].results[0].message.text).toContain("critical drift");
  });

  it("returns non-zero for live drift findings", async () => {
    const report = await runLiveValidation({
      adapters: [
        adapter("github", [
          finding({
            id: "LIVE-DRIFT-1",
            provider: "github",
            severity: "high",
            status: "fail",
            resource: "github:repo/prod",
            message: "protected environment reviewer removed",
          }),
        ]),
      ],
      timeoutMs: 1_000,
      maxConcurrency: 1,
      clock: () => FIXED_TIME,
    });

    expect(report.exitCode).toBe(1);
    expect(report.summary).toMatchObject({ fail: 1, degraded: 0 });
  });

  it("evaluates GitHub runner governance happy path with live environment evidence", async () => {
    const mod = (await import("../src/live-validator")) as Record<string, unknown>;
    expect(mod.evaluateGitHubRunnerGovernance).toBeTypeOf("function");
    const evaluateGitHubRunnerGovernance = mod.evaluateGitHubRunnerGovernance as (args: {
      repoFullName: string;
      expectedEnvironments: string[];
      productionEnvironments: string[];
      environments: Array<{ name: string; protectionRules: string[] }>;
      workflowJobs: Array<{
        workflowPath: string;
        jobName: string;
        environmentName: string;
        runsOn: string[];
        oidcRequired: boolean;
      }>;
    }) => LiveValidationFinding[];

    const findings = evaluateGitHubRunnerGovernance({
      repoFullName: "kerberosmansour/hulumi",
      expectedEnvironments: ["prod"],
      productionEnvironments: ["prod"],
      environments: [{ name: "prod", protectionRules: ["required_reviewers"] }],
      workflowJobs: [
        {
          workflowPath: ".github/workflows/deploy.yml",
          jobName: "deploy",
          environmentName: "prod",
          runsOn: ["ubuntu-latest"],
          oidcRequired: true,
        },
      ],
    });

    expect(findings.every((finding) => finding.status === "pass")).toBe(true);
    expect(findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        "WF_ENV_2_LIVE_ENVIRONMENT_EXISTS",
        "WF_ENV_3_LIVE_ENVIRONMENT_REQUIRES_REVIEWERS",
        "WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL",
      ]),
    );
  });

  it("emits M7 GitHub findings for missing environments, missing reviewers, page caps, self-hosted runners, and cloud secrets", async () => {
    const mod = (await import("../src/live-validator")) as Record<string, unknown>;
    const evaluateGitHubRunnerGovernance = mod.evaluateGitHubRunnerGovernance as (args: {
      repoFullName: string;
      expectedEnvironments: string[];
      productionEnvironments: string[];
      environments: Array<{ name: string; protectionRules: string[] }>;
      workflowJobs: Array<{
        workflowPath: string;
        jobName: string;
        environmentName: string;
        runsOn: string[];
        oidcRequired: boolean;
        longLivedCloudSecretNames?: string[];
      }>;
      runnerPageCap: number;
      runnerResultsComplete: boolean;
    }) => LiveValidationFinding[];

    const findings = evaluateGitHubRunnerGovernance({
      repoFullName: "kerberosmansour/hulumi",
      expectedEnvironments: ["prod", "staging"],
      productionEnvironments: ["prod"],
      environments: [{ name: "prod", protectionRules: ["branch_policy"] }],
      workflowJobs: [
        {
          workflowPath: ".github/workflows/deploy.yml",
          jobName: "deploy",
          environmentName: "prod",
          runsOn: ["self-hosted", "linux", "x64", "deploy-prod"],
          oidcRequired: false,
          longLivedCloudSecretNames: ["AWS_ACCESS_KEY_ID"],
        },
      ],
      runnerPageCap: 1,
      runnerResultsComplete: false,
    });

    expect(findings.map((finding) => finding.id)).toEqual(
      expect.arrayContaining([
        "WF_ENV_2_LIVE_ENVIRONMENT_EXISTS",
        "WF_ENV_3_LIVE_ENVIRONMENT_REQUIRES_REVIEWERS",
        "WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL",
        "GH_RUNNER_2_PAGE_CAP_COMPLETE",
        "DEPLOY_GOV_2_NO_LONG_LIVED_AWS_SECRETS",
      ]),
    );
    expect(findings.some((finding) => finding.status === "fail")).toBe(true);
    expect(findings.some((finding) => finding.status === "degraded")).toBe(true);
  });
});
