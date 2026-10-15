import * as pulumi from "@pulumi/pulumi";
import { afterEach, describe, expect, it } from "vitest";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

const valid = {
  tier: "startup-hardened",
  owner: "example-org",
  repository: "example-repo",
  projectName: "isolated-runner",
  sourceAuthentication: "existing-account-oauth",
};
async function construct(overrides: Record<string, unknown> = {}) {
  const mod = (await import("../src")) as unknown as Record<string, unknown>;
  expect(mod.CodeBuildGitHubRunner).toBeTypeOf("function");
  const Constructor = mod.CodeBuildGitHubRunner as new (
    name: string,
    args: Record<string, unknown>,
  ) => {
    projectName: pulumi.Output<string>;
    runnerLabelTemplate: pulumi.Output<string>;
    recommendedLabels: pulumi.Output<string[]>;
  };
  return new Constructor("test-runner", { ...valid, ...overrides });
}
describe("CodeBuildGitHubRunner", () => {
  afterEach(resetRegistrations);
  it("registers own-log-only ephemeral defaults and an owner-bound signed webhook pair", async () => {
    const runner = await construct();
    await valueOf(runner.projectName);
    await settlePulumi();
    const get = (type: string) => registrations.find((r) => r.type === type)?.inputs;
    const project = get("aws:codebuild/project:Project")!;
    expect(project).toMatchObject({
      name: valid.projectName,
      artifacts: { type: "NO_ARTIFACTS" },
      cache: { type: "NO_CACHE" },
      buildTimeout: 30,
      queuedTimeout: 15,
      concurrentBuildLimit: 1,
      environment: {
        type: "ARM_CONTAINER",
        privilegedMode: false,
        imagePullCredentialsType: "CODEBUILD",
      },
      source: { type: "GITHUB", location: "https://github.com/example-org/example-repo.git" },
    });
    expect(project.vpcConfig).toBeUndefined();
    const policy = JSON.parse(get("aws:iam/rolePolicy:RolePolicy")!.policy as string);
    expect(policy.Statement).toEqual([
      {
        Effect: "Allow",
        Action: ["logs:CreateLogStream", "logs:DescribeLogStreams", "logs:PutLogEvents"],
        Resource:
          "arn:aws:logs:eu-west-2:123456789012:log-group:/hulumi/codebuild/isolated-runner:*",
      },
    ]);
    const trust = JSON.parse(get("aws:iam/role:Role")!.assumeRolePolicy as string);
    expect(trust.Statement[0].Condition.StringEquals["aws:SourceAccount"]).toBe("123456789012");
    expect(trust.Statement[0].Condition.ArnEquals["aws:SourceArn"]).toBe(
      "arn:aws:codebuild:eu-west-2:123456789012:project/isolated-runner",
    );
    expect(get("aws:codebuild/webhook:Webhook")).toMatchObject({
      manualCreation: true,
      buildType: "BUILD",
      filterGroups: [{ filters: [{ type: "EVENT", pattern: "WORKFLOW_JOB_QUEUED" }] }],
    });
    const hook = get("github:index/repositoryWebhook:RepositoryWebhook")!;
    expect(hook).toMatchObject({
      repository: valid.repository,
      active: true,
      events: ["workflow_job"],
    });
    const provider = get("pulumi:providers:github")!;
    expect(provider).toMatchObject({ owner: valid.owner, baseUrl: "https://api.github.com/" });
    expect(registrations.some((r) => /sourceCredential/i.test(r.type))).toBe(false);
    expect(await valueOf(runner.runnerLabelTemplate)).toBe(
      "codebuild-isolated-runner-${{ github.run_id }}-${{ github.run_attempt }}",
    );
  });
  it("marks native webhook credentials secret instead of exposing them as public component outputs", async () => {
    const runner = await construct({
      githubAuth: { token: pulumi.secret("synthetic-provider-token") },
    });
    await valueOf(runner.projectName);
    await settlePulumi();
    const hook = registrations.find(
      (r) => r.type === "github:index/repositoryWebhook:RepositoryWebhook",
    )!;
    const config = hook.inputs.configuration as Record<string, unknown>;
    expect(config).toHaveProperty(pulumi.runtime.specialSigKey, pulumi.runtime.specialSecretSig);
    expect(Object.keys(runner)).not.toContain("webhookSecret");
    expect(Object.keys(runner)).not.toContain("payloadUrl");
  });
  it("supports explicit x86/privileged/VPC choices without silently changing default authority", async () => {
    const runner = await construct({
      architecture: "x86_64",
      instanceSize: "medium",
      privilegedMode: true,
      vpc: { vpcId: "vpc-123abc", subnetIds: ["subnet-123abc"], securityGroupIds: ["sg-123abc"] },
      repositoryVariableName: "CI_RUNNER_PROJECT",
    });
    await valueOf(runner.projectName);
    await settlePulumi();
    const p = registrations.find((r) => r.type === "aws:codebuild/project:Project")!.inputs;
    expect(p.environment).toMatchObject({
      type: "LINUX_CONTAINER",
      image: "aws/codebuild/standard:7.0",
      computeType: "BUILD_GENERAL1_MEDIUM",
      privilegedMode: true,
    });
    expect(p.vpcConfig).toMatchObject({ vpcId: "vpc-123abc", subnets: ["subnet-123abc"] });
    expect(
      registrations.find((r) => r.type === "github:index/actionsVariable:ActionsVariable")?.inputs,
    ).toMatchObject({ variableName: "CI_RUNNER_PROJECT", value: valid.projectName });
  });
  it.each([1, 2, 3, 4])(
    "rejects build and queue timeouts below AWS minimum: %i",
    async (minutes) => {
      await expect(construct({ buildTimeoutMinutes: minutes })).rejects.toThrow(
        /CodeBuildGitHubRunner/,
      );
      await expect(construct({ queuedTimeoutMinutes: minutes })).rejects.toThrow(
        /CodeBuildGitHubRunner/,
      );
    },
  );
  it("accepts both exact five-minute timeout boundaries", async () => {
    const runner = await construct({ buildTimeoutMinutes: 5, queuedTimeoutMinutes: 5 });
    await valueOf(runner.projectName);
    await settlePulumi();
    expect(
      registrations.find((r) => r.type === "aws:codebuild/project:Project")?.inputs,
    ).toMatchObject({ buildTimeout: 5, queuedTimeout: 5 });
  });
  it.each([
    { owner: "../attacker" },
    { repository: "a/b" },
    { projectName: "*" },
    { architecture: "custom-arm" },
    { instanceSize: "2xlarge" },
    { buildTimeoutMinutes: 0 },
    { buildTimeoutMinutes: 121 },
    { queuedTimeoutMinutes: 61 },
    { concurrentBuildLimit: 5 },
    { sourceAuthentication: "codeconnections" },
    { privilegedMode: "true" },
    { vpc: { vpcId: "vpc-123abc", subnetIds: [], securityGroupIds: [] } },
    { repositoryVariableName: "GITHUB_TOKEN" },
    { githubAuth: { token: "a", appAuth: {} } },
  ])("rejects invalid authority/config before child resource registration: %j", async (args) => {
    await expect(construct(args)).rejects.toThrow(/CodeBuildGitHubRunner/);
    await settlePulumi();
    expect(
      registrations.filter((r) => r.type !== "hulumi:platform:CodeBuildGitHubRunner"),
    ).toHaveLength(0);
  });
});
