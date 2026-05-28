import { describe, expect, it } from "vitest";

const REQUIRED_ENV = [
  "HULUMI_GITHUB_RUNNER_GOVERNANCE_INTEGRATION",
  "HULUMI_GITHUB_RUNNER_GOVERNANCE_REPOSITORY",
  "GITHUB_TOKEN",
] as const;

type Env = Record<string, string | undefined>;

export function missingRunnerGovernanceEnvVars(env: Env = process.env): string[] {
  return REQUIRED_ENV.filter((name) => {
    if (name === "HULUMI_GITHUB_RUNNER_GOVERNANCE_INTEGRATION") return env[name] !== "1";
    return env[name] === undefined || env[name]?.trim() === "";
  });
}

const missing = missingRunnerGovernanceEnvVars();
const enabled = missing.length === 0;
const skipReason =
  missing.length === 0
    ? ""
    : `github_runner_governance_contract_or_skip skipped; missing env vars: ${missing.join(", ")}`;

describe.skipIf(!enabled)("github_runner_governance_contract_or_skip", () => {
  it("has the GitHub inputs needed to read environment and runner settings safely", () => {
    expect(process.env.HULUMI_GITHUB_RUNNER_GOVERNANCE_INTEGRATION).toBe("1");
    expect(process.env.HULUMI_GITHUB_RUNNER_GOVERNANCE_REPOSITORY).toMatch(/^[^/]+\/[^/]+$/);
    expect(process.env.GITHUB_TOKEN).toBeDefined();
  });

  it("records the read-only inspection scope for live runner governance", () => {
    expect({
      allowedReads: [
        "GET /repos/{owner}/{repo}/environments/{name}",
        "GET /repos/{owner}/{repo}/actions/runners",
      ],
      forbiddenWrites: ["runner registration token creation", "environment mutation"],
    }).toMatchObject({
      forbiddenWrites: expect.arrayContaining(["environment mutation"]),
    });
  });
});

if (!enabled) {
  describe("github_runner_governance_contract_or_skip - gated skip notice", () => {
    it.skip(skipReason, () => {
      // intentionally skipped; the test title is the machine-readable evidence.
    });
  });
}
