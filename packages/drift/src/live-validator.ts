import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import pTimeout from "p-timeout";

export const LIVE_VALIDATOR_CONFIG_SCHEMA = "hulumi.live-validator.config.v1" as const;
export const LIVE_VALIDATOR_REPORT_SCHEMA = "hulumi.live-validator.report.v1" as const;

export const LIVE_PROVIDERS = ["aws-org", "pulumi-state", "eks", "github"] as const;
export type LiveProvider = (typeof LIVE_PROVIDERS)[number];

export const LIVE_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type LiveSeverity = (typeof LIVE_SEVERITIES)[number];

export const LIVE_STATUSES = ["pass", "fail", "degraded", "skipped"] as const;
export type LiveStatus = (typeof LIVE_STATUSES)[number];

export const LIVE_FORMATS = ["json", "markdown", "sarif"] as const;
export type LiveOutputFormat = (typeof LIVE_FORMATS)[number];

export interface LiveValidationFinding {
  id: string;
  provider: LiveProvider;
  severity: LiveSeverity;
  status: LiveStatus;
  resource: string;
  message: string;
  evidence: Record<string, unknown>;
  observedAt?: string;
}

export interface LiveValidationSummary {
  total: number;
  pass: number;
  fail: number;
  degraded: number;
  skipped: number;
}

export interface LiveValidationReport {
  schemaVersion: typeof LIVE_VALIDATOR_REPORT_SCHEMA;
  generatedAt: string;
  summary: LiveValidationSummary;
  findings: LiveValidationFinding[];
  exitCode: number;
}

export interface LiveValidationContext {
  timeoutMs: number;
  pageCap: number;
  clock: () => string;
}

export interface LiveProviderAdapter {
  provider: LiveProvider;
  run(signal: AbortSignal, context: LiveValidationContext): Promise<LiveValidationFinding[]>;
}

export interface RunLiveValidationArgs {
  adapters: LiveProviderAdapter[];
  timeoutMs?: number;
  maxConcurrency?: number;
  pageCap?: number;
  outputMaxBytes?: number;
  clock?: () => string;
}

export interface LiveValidatorFileConfig {
  schemaVersion: typeof LIVE_VALIDATOR_CONFIG_SCHEMA;
  providers?: LiveProvider[];
  checks?: LiveValidationFinding[];
  timeoutMs?: number;
  maxConcurrency?: number;
  pageCap?: number;
  outputMaxBytes?: number;
}

export interface LiveValidatorCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitHubRunnerGovernanceEnvironment {
  name: string;
  exists?: boolean;
  protectionRules?: readonly string[];
  reviewers?: readonly unknown[];
}

export interface GitHubRunnerGovernanceWorkflowJob {
  workflowPath: string;
  jobName: string;
  environmentName?: string;
  runsOn: readonly string[];
  oidcRequired?: boolean;
  longLivedCloudSecretNames?: readonly string[];
}

export interface GitHubRunnerGovernanceArgs {
  repoFullName: string;
  expectedEnvironments: readonly string[];
  productionEnvironments?: readonly string[];
  environments?: readonly GitHubRunnerGovernanceEnvironment[];
  workflowJobs?: readonly GitHubRunnerGovernanceWorkflowJob[];
  approvedSelfHostedRunnerLabels?: readonly string[];
  runnerPageCap?: number;
  runnerResultsComplete?: boolean;
  observedAt?: string;
}

interface ParsedLiveValidatorArgs {
  configPath?: string;
  formats: LiveOutputFormat[];
  providers?: LiveProvider[];
  outDir?: string;
  timeoutMs?: number;
  maxConcurrency?: number;
  pageCap?: number;
  outputMaxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CONCURRENCY = 2;
const DEFAULT_PAGE_CAP = 100;
const DEFAULT_OUTPUT_MAX_BYTES = 1_000_000;
const SECRET_KEY = /secret|token|password|credential|kubeconfig|access[_-]?key/i;
const LONG_LIVED_CLOUD_SECRET_NAMES = new Set([
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_ACCESS_KEY",
  "AZURE_CLIENT_SECRET",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GCP_SERVICE_ACCOUNT_KEY",
]);

export function evaluateGitHubRunnerGovernance(
  args: GitHubRunnerGovernanceArgs,
): LiveValidationFinding[] {
  const repoFullName = nonEmpty(args.repoFullName, "repoFullName");
  const observedAt = args.observedAt;
  const expectedEnvironments = Array.from(
    new Set(args.expectedEnvironments.map((name) => nonEmpty(name, "environment name"))),
  ).sort();
  const productionEnvironments = new Set(
    (args.productionEnvironments ?? ["prod"]).map((name) => nonEmpty(name, "production name")),
  );
  const environmentsByName = new Map(
    (args.environments ?? []).map((env) => [nonEmpty(env.name, "environment name"), env]),
  );
  const findings: LiveValidationFinding[] = [];

  for (const envName of expectedEnvironments) {
    const state = environmentsByName.get(envName);
    const resource = `github:${repoFullName}/environments/${envName}`;
    if (state === undefined || state.exists === false) {
      findings.push(
        githubFinding({
          id: "WF_ENV_2_LIVE_ENVIRONMENT_EXISTS",
          severity: "high",
          status: "fail",
          resource,
          message: `GitHub environment ${envName} is declared by workflow governance but missing from live repo settings.`,
          evidence: { expectedEnvironment: envName, liveEnvironmentPresent: false },
          observedAt,
        }),
      );
      continue;
    }
    findings.push(
      githubFinding({
        id: "WF_ENV_2_LIVE_ENVIRONMENT_EXISTS",
        severity: "info",
        status: "pass",
        resource,
        message: `GitHub environment ${envName} exists in live repo settings.`,
        evidence: { expectedEnvironment: envName, liveEnvironmentPresent: true },
        observedAt,
      }),
    );
    if (!productionEnvironments.has(envName)) continue;
    if (hasReviewerProtection(state)) {
      findings.push(
        githubFinding({
          id: "WF_ENV_3_LIVE_ENVIRONMENT_REQUIRES_REVIEWERS",
          severity: "info",
          status: "pass",
          resource,
          message: `GitHub environment ${envName} has required reviewer protection.`,
          evidence: { expectedEnvironment: envName, reviewerProtection: true },
          observedAt,
        }),
      );
    } else {
      findings.push(
        githubFinding({
          id: "WF_ENV_3_LIVE_ENVIRONMENT_REQUIRES_REVIEWERS",
          severity: "high",
          status: "fail",
          resource,
          message: `GitHub environment ${envName} lacks required reviewer protection.`,
          evidence: {
            expectedEnvironment: envName,
            reviewerProtection: false,
            protectionRules: state.protectionRules ?? [],
          },
          observedAt,
        }),
      );
    }
  }

  findings.push(...evaluateRunnerJobs(args, observedAt));

  if (args.runnerResultsComplete === false) {
    findings.push(
      githubFinding({
        id: "GH_RUNNER_2_PAGE_CAP_COMPLETE",
        severity: "medium",
        status: "degraded",
        resource: `github:${repoFullName}/actions/runners`,
        message: "GitHub Actions runner pagination reached the configured cap before completion.",
        evidence: { runnerPageCap: args.runnerPageCap ?? DEFAULT_PAGE_CAP, complete: false },
        observedAt,
      }),
    );
  }

  return findings.sort(compareFindings);
}

function evaluateRunnerJobs(
  args: GitHubRunnerGovernanceArgs,
  observedAt: string | undefined,
): LiveValidationFinding[] {
  const repoFullName = nonEmpty(args.repoFullName, "repoFullName");
  const approved = new Set((args.approvedSelfHostedRunnerLabels ?? []).map(normalizeLabel));
  const jobs = args.workflowJobs ?? [];
  const findings: LiveValidationFinding[] = [];
  let sawSelfHosted = false;
  for (const job of jobs) {
    const labels = job.runsOn.map(normalizeLabel);
    const resource = `${job.workflowPath}#${job.jobName}`;
    if (labels.includes("self-hosted")) {
      sawSelfHosted = true;
      const nonSelfHostedLabels = labels.filter((label) => label !== "self-hosted");
      const unapproved = nonSelfHostedLabels.filter((label) => !approved.has(label));
      if (approved.size === 0 || nonSelfHostedLabels.length === 0 || unapproved.length > 0) {
        findings.push(
          githubFinding({
            id: "WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL",
            severity: "critical",
            status: "fail",
            resource,
            message: "Privileged workflow job uses unapproved self-hosted runner labels.",
            evidence: {
              repoFullName,
              runsOn: labels,
              approvedLabels: Array.from(approved).sort(),
              unapprovedLabels: unapproved,
            },
            observedAt,
          }),
        );
      } else {
        findings.push(
          githubFinding({
            id: "WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL",
            severity: "info",
            status: "pass",
            resource,
            message: "Self-hosted runner labels are explicitly approved for this job.",
            evidence: { repoFullName, runsOn: labels, approvedLabels: Array.from(approved).sort() },
            observedAt,
          }),
        );
      }
    }
    if (job.oidcRequired === false || hasLongLivedCloudSecret(job)) {
      findings.push(
        githubFinding({
          id: "DEPLOY_GOV_2_NO_LONG_LIVED_AWS_SECRETS",
          severity: "high",
          status: "fail",
          resource,
          message:
            "Privileged deployment job must use OIDC and must not reference long-lived cloud credential secret names.",
          evidence: {
            oidcRequired: job.oidcRequired !== false,
            longLivedCloudSecretNames: (job.longLivedCloudSecretNames ?? []).map((name) =>
              name.toUpperCase(),
            ),
          },
          observedAt,
        }),
      );
    }
  }
  if (!sawSelfHosted) {
    findings.push(
      githubFinding({
        id: "WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL",
        severity: "info",
        status: "pass",
        resource: `github:${repoFullName}/actions/runners`,
        message: "No privileged workflow job uses self-hosted runners.",
        evidence: { repoFullName, privilegedWorkflowJobs: jobs.length },
        observedAt,
      }),
    );
  }
  return findings;
}

function githubFinding(
  fields: Omit<LiveValidationFinding, "provider" | "observedAt"> & {
    observedAt?: string | undefined;
  },
): LiveValidationFinding {
  const { observedAt, ...rest } = fields;
  return observedAt === undefined
    ? {
        provider: "github",
        ...rest,
      }
    : {
        provider: "github",
        observedAt,
        ...rest,
      };
}

function nonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${field} must be non-empty`);
  return trimmed;
}

function normalizeLabel(label: string): string {
  return nonEmpty(label, "runner label").toLowerCase();
}

function hasReviewerProtection(environment: GitHubRunnerGovernanceEnvironment): boolean {
  if (Array.isArray(environment.reviewers) && environment.reviewers.length > 0) return true;
  return (environment.protectionRules ?? []).some(
    (rule) => rule === "required_reviewers" || rule === "required_reviewer",
  );
}

function hasLongLivedCloudSecret(job: GitHubRunnerGovernanceWorkflowJob): boolean {
  return (job.longLivedCloudSecretNames ?? []).some((name) =>
    LONG_LIVED_CLOUD_SECRET_NAMES.has(name.toUpperCase()),
  );
}

export async function runLiveValidation(
  args: RunLiveValidationArgs,
): Promise<LiveValidationReport> {
  const generatedAt = (args.clock ?? (() => new Date().toISOString()))();
  const timeoutMs = positiveInt(args.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs");
  const maxConcurrency = Math.min(
    positiveInt(args.maxConcurrency, DEFAULT_MAX_CONCURRENCY, "maxConcurrency"),
    Math.max(args.adapters.length, 1),
  );
  const pageCap = positiveInt(args.pageCap, DEFAULT_PAGE_CAP, "pageCap");
  const context: LiveValidationContext = {
    timeoutMs,
    pageCap,
    clock: args.clock ?? (() => new Date().toISOString()),
  };

  const findings: LiveValidationFinding[] = [];
  let cursor = 0;
  const adapters = [...args.adapters].sort((a, b) => a.provider.localeCompare(b.provider));

  async function worker(): Promise<void> {
    while (cursor < adapters.length) {
      const adapter = adapters[cursor];
      cursor += 1;
      findings.push(...(await runAdapterBounded(adapter, context)));
    }
  }

  await Promise.all(Array.from({ length: maxConcurrency }, worker));

  const normalized = findings
    .map((finding) => normalizeFinding(finding, context.clock()))
    .sort(compareFindings);
  const summary = summarize(normalized);
  const exitCode = summary.fail > 0 || summary.degraded > 0 || summary.total === 0 ? 1 : 0;

  return {
    schemaVersion: LIVE_VALIDATOR_REPORT_SCHEMA,
    generatedAt,
    summary,
    findings: normalized,
    exitCode,
  };
}

export function renderLiveValidationJson(report: LiveValidationReport): string {
  return `${JSON.stringify(redactReport(report), null, 2)}\n`;
}

export function renderLiveValidationMarkdown(report: LiveValidationReport): string {
  const clean = redactReport(report);
  const lines = [
    "# Hulumi Live Validation Report",
    "",
    `Generated: ${escapeMarkdownCell(clean.generatedAt)}`,
    "",
    "| Total | Pass | Fail | Degraded | Skipped |",
    "|---:|---:|---:|---:|---:|",
    `| ${clean.summary.total} | ${clean.summary.pass} | ${clean.summary.fail} | ${clean.summary.degraded} | ${clean.summary.skipped} |`,
    "",
    "| Provider | ID | Severity | Status | Resource | Message |",
    "|---|---|---|---|---|---|",
  ];
  for (const finding of clean.findings) {
    lines.push(
      `| ${escapeMarkdownCell(finding.provider)} | ${escapeMarkdownCell(finding.id)} | ${escapeMarkdownCell(finding.severity)} | ${escapeMarkdownCell(finding.status)} | ${escapeMarkdownCell(finding.resource)} | ${escapeMarkdownCell(finding.message)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function renderLiveValidationSarif(report: LiveValidationReport): string {
  const clean = redactReport(report);
  const rules = Array.from(new Map(clean.findings.map((finding) => [finding.id, finding])).values())
    .sort(compareFindings)
    .map((finding) => ({
      id: finding.id,
      name: finding.id,
      shortDescription: { text: `${finding.provider} ${finding.id}` },
      fullDescription: { text: finding.message },
      properties: {
        provider: finding.provider,
        severity: finding.severity,
        status: finding.status,
      },
    }));
  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "hulumi validate live",
            informationUri: "https://github.com/kerberosmansour/hulumi",
            rules,
          },
        },
        results: clean.findings.map((finding) => ({
          ruleId: finding.id,
          level: sarifLevel(finding),
          message: {
            text: `[${finding.provider}] ${finding.status}/${finding.severity}: ${finding.message}`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: finding.resource,
                },
              },
            },
          ],
          properties: {
            provider: finding.provider,
            severity: finding.severity,
            status: finding.status,
            evidence: finding.evidence,
            observedAt: finding.observedAt,
          },
        })),
      },
    ],
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

export async function runLiveValidatorCli(argv: string[]): Promise<LiveValidatorCliResult> {
  try {
    const parsed = parseLiveValidatorArgs(argv);
    if (parsed.configPath === undefined) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "hulumi validate live: no checks configured; pass --config <file>\n",
      };
    }
    const config = loadLiveValidatorConfig(parsed.configPath);
    const selectedProviders = parsed.providers ?? config.providers;
    validateProviderList(selectedProviders ?? []);
    const adapters = adaptersFromConfig(config, selectedProviders);
    const runArgs: RunLiveValidationArgs = { adapters };
    const timeoutMs = parsed.timeoutMs ?? config.timeoutMs;
    const maxConcurrency = parsed.maxConcurrency ?? config.maxConcurrency;
    const pageCap = parsed.pageCap ?? config.pageCap;
    const configuredOutputMaxBytes = parsed.outputMaxBytes ?? config.outputMaxBytes;
    if (timeoutMs !== undefined) runArgs.timeoutMs = timeoutMs;
    if (maxConcurrency !== undefined) runArgs.maxConcurrency = maxConcurrency;
    if (pageCap !== undefined) runArgs.pageCap = pageCap;
    if (configuredOutputMaxBytes !== undefined) runArgs.outputMaxBytes = configuredOutputMaxBytes;
    const report = await runLiveValidation(runArgs);

    if (report.summary.total === 0) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "hulumi validate live: no checks configured for selected providers\n",
      };
    }

    const outputMaxBytes = configuredOutputMaxBytes ?? DEFAULT_OUTPUT_MAX_BYTES;
    const rendered = parsed.formats.map((format) => ({
      format,
      text: renderReport(format, report),
    }));
    for (const item of rendered) {
      assertOutputSize(item.text, outputMaxBytes, item.format);
    }

    if (parsed.outDir !== undefined) {
      mkdirSync(parsed.outDir, { recursive: true });
      for (const item of rendered) {
        writeFileSync(join(parsed.outDir, outputFileName(item.format)), item.text, "utf8");
      }
      return {
        exitCode: report.exitCode,
        stdout: `hulumi validate live: wrote ${rendered.length} artifact(s) to ${parsed.outDir}\n`,
        stderr: "",
      };
    }

    return {
      exitCode: report.exitCode,
      stdout: rendered.map((item) => item.text).join(""),
      stderr: "",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const usage = message.startsWith("usage:") || message.includes("unsupported provider");
    return {
      exitCode: usage ? 2 : 1,
      stdout: "",
      stderr: `hulumi validate live: ${message}\n`,
    };
  }
}

function parseLiveValidatorArgs(argv: string[]): ParsedLiveValidatorArgs {
  if (argv[0] !== "validate" || argv[1] !== "live") {
    throw new Error("usage: hulumi validate live [--config file] [--format json|markdown|sarif]");
  }
  const result: ParsedLiveValidatorArgs = { formats: ["json"] };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      result.configPath = requireValue(argv, ++i, arg);
    } else if (arg === "--format") {
      result.formats = parseFormats(requireValue(argv, ++i, arg));
    } else if (arg === "--provider") {
      result.providers = parseProviders(requireValue(argv, ++i, arg));
    } else if (arg === "--out-dir") {
      result.outDir = requireValue(argv, ++i, arg);
    } else if (arg === "--timeout-ms") {
      result.timeoutMs = parsePositiveFlag(requireValue(argv, ++i, arg), arg);
    } else if (arg === "--concurrency") {
      result.maxConcurrency = parsePositiveFlag(requireValue(argv, ++i, arg), arg);
    } else if (arg === "--page-cap") {
      result.pageCap = parsePositiveFlag(requireValue(argv, ++i, arg), arg);
    } else if (arg === "--output-max-bytes") {
      result.outputMaxBytes = parsePositiveFlag(requireValue(argv, ++i, arg), arg);
    } else {
      throw new Error(`usage: unknown argument ${arg}`);
    }
  }
  return result;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`usage: ${flag} requires a value`);
  }
  return value;
}

function parseFormats(value: string): LiveOutputFormat[] {
  const formats = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (formats.length === 0) throw new Error("usage: --format requires at least one format");
  for (const format of formats) {
    if (!isLiveFormat(format)) throw new Error(`usage: unsupported format ${format}`);
  }
  return Array.from(new Set(formats)) as LiveOutputFormat[];
}

function parseProviders(value: string): LiveProvider[] {
  const providers = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (providers.length === 0) throw new Error("usage: --provider requires at least one provider");
  for (const provider of providers) {
    if (!isLiveProvider(provider)) {
      throw new Error(`unsupported provider ${provider}; expected ${LIVE_PROVIDERS.join(", ")}`);
    }
  }
  return Array.from(new Set(providers)) as LiveProvider[];
}

function parsePositiveFlag(value: string, flag: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`usage: ${flag} must be a positive integer`);
  }
  return Number(value);
}

function loadLiveValidatorConfig(path: string): LiveValidatorFileConfig {
  const raw = readFileSync(resolve(path), "utf8");
  const parsed = JSON.parse(raw) as LiveValidatorFileConfig;
  if (parsed.schemaVersion !== LIVE_VALIDATOR_CONFIG_SCHEMA) {
    throw new Error(`config schemaVersion must be ${LIVE_VALIDATOR_CONFIG_SCHEMA}`);
  }
  validateProviderList(parsed.providers ?? []);
  for (const check of parsed.checks ?? []) {
    normalizeFinding(check, check.observedAt ?? new Date(0).toISOString());
  }
  return parsed;
}

function adaptersFromConfig(
  config: LiveValidatorFileConfig,
  selectedProviders?: LiveProvider[],
): LiveProviderAdapter[] {
  const findings = config.checks ?? [];
  const providers = selectedProviders ?? config.providers ?? uniqueProviders(findings);
  return providers.map((provider) => ({
    provider,
    run: async () => findings.filter((finding) => finding.provider === provider),
  }));
}

async function runAdapterBounded(
  adapter: LiveProviderAdapter,
  context: LiveValidationContext,
): Promise<LiveValidationFinding[]> {
  const controller = new AbortController();
  try {
    const findings = await pTimeout(adapter.run(controller.signal, context), {
      milliseconds: context.timeoutMs,
      message: `${adapter.provider} adapter timed out after ${context.timeoutMs}ms`,
    });
    const capped = findings.slice(0, context.pageCap);
    if (findings.length <= context.pageCap) return capped;
    return [
      ...capped,
      degradedFinding(adapter.provider, context.clock(), {
        reason: "page cap exceeded",
        pageCap: context.pageCap,
        returned: findings.length,
      }),
    ];
  } catch (err) {
    controller.abort();
    return [
      degradedFinding(adapter.provider, context.clock(), {
        reason: err instanceof Error ? err.message : String(err),
      }),
    ];
  }
}

function degradedFinding(
  provider: LiveProvider,
  observedAt: string,
  evidence: Record<string, unknown>,
): LiveValidationFinding {
  return {
    id: `HULUMI-LIVE-${provider.toUpperCase().replace(/-/g, "_")}-DEGRADED`,
    provider,
    severity: "medium",
    status: "degraded",
    resource: provider,
    message: `${provider} live posture could not be fully evaluated`,
    evidence,
    observedAt,
  };
}

function normalizeFinding(
  finding: LiveValidationFinding,
  observedAt: string,
): LiveValidationFinding {
  if (!finding.id || typeof finding.id !== "string") {
    throw new Error("finding.id must be a non-empty string");
  }
  if (!isLiveProvider(finding.provider))
    throw new Error(`unsupported provider ${finding.provider}`);
  if (!isLiveSeverity(finding.severity)) {
    throw new Error(`unsupported severity ${finding.severity}`);
  }
  if (!isLiveStatus(finding.status)) throw new Error(`unsupported status ${finding.status}`);
  if (!finding.resource || typeof finding.resource !== "string") {
    throw new Error("finding.resource must be a non-empty string");
  }
  if (!finding.message || typeof finding.message !== "string") {
    throw new Error("finding.message must be a non-empty string");
  }
  return {
    ...finding,
    observedAt: finding.observedAt ?? observedAt,
    evidence: redactValue(finding.evidence) as Record<string, unknown>,
  };
}

function summarize(findings: LiveValidationFinding[]): LiveValidationSummary {
  return {
    total: findings.length,
    pass: findings.filter((finding) => finding.status === "pass").length,
    fail: findings.filter((finding) => finding.status === "fail").length,
    degraded: findings.filter((finding) => finding.status === "degraded").length,
    skipped: findings.filter((finding) => finding.status === "skipped").length,
  };
}

function compareFindings(a: LiveValidationFinding, b: LiveValidationFinding): number {
  return (
    a.provider.localeCompare(b.provider) ||
    a.id.localeCompare(b.id) ||
    a.resource.localeCompare(b.resource)
  );
}

function redactReport(report: LiveValidationReport): LiveValidationReport {
  return {
    ...report,
    findings: report.findings.map((finding) => normalizeFinding(finding, finding.observedAt ?? "")),
  };
}

function redactValue(value: unknown, depth = 0, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (depth > 8) return "[redacted-depth-limit]";
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      out[entryKey] = redactValue(entryValue, depth + 1, entryKey);
    }
    return out;
  }
  return value;
}

function escapeMarkdownCell(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>");
}

function sarifLevel(finding: LiveValidationFinding): "error" | "warning" | "note" | "none" {
  if (finding.status === "pass") return "note";
  if (finding.status === "skipped") return "none";
  if (finding.severity === "critical" || finding.severity === "high") return "error";
  if (finding.severity === "medium" || finding.severity === "low") return "warning";
  return "note";
}

function renderReport(format: LiveOutputFormat, report: LiveValidationReport): string {
  switch (format) {
    case "json":
      return renderLiveValidationJson(report);
    case "markdown":
      return renderLiveValidationMarkdown(report);
    case "sarif":
      return renderLiveValidationSarif(report);
  }
}

function outputFileName(format: LiveOutputFormat): string {
  switch (format) {
    case "json":
      return "hulumi-live-validation.json";
    case "markdown":
      return "hulumi-live-validation.md";
    case "sarif":
      return "hulumi-live-validation.sarif";
  }
}

function assertOutputSize(text: string, maxBytes: number, format: LiveOutputFormat): void {
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    throw new Error(`${format} output exceeds ${maxBytes} byte guard`);
  }
}

function uniqueProviders(findings: LiveValidationFinding[]): LiveProvider[] {
  return Array.from(new Set(findings.map((finding) => finding.provider))).sort();
}

function validateProviderList(providers: readonly LiveProvider[]): void {
  for (const provider of providers) {
    if (!isLiveProvider(provider)) throw new Error(`unsupported provider ${provider}`);
  }
}

function isLiveProvider(value: string): value is LiveProvider {
  return (LIVE_PROVIDERS as readonly string[]).includes(value);
}

function isLiveSeverity(value: string): value is LiveSeverity {
  return (LIVE_SEVERITIES as readonly string[]).includes(value);
}

function isLiveStatus(value: string): value is LiveStatus {
  return (LIVE_STATUSES as readonly string[]).includes(value);
}

function isLiveFormat(value: string): value is LiveOutputFormat {
  return (LIVE_FORMATS as readonly string[]).includes(value);
}

function positiveInt(value: number | undefined, fallback: number, field: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}
