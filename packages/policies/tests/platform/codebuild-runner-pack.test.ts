import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
const sdkProxy = createRequire(__filename)("@pulumi/policy/proxy") as {
  unknownCheckingProxy: (props: Record<string, unknown>) => Record<string, unknown>;
  unknownStringValue: string;
  unknownBooleanValue: string;
  unknownObjectValue: string;
};
import type {
  ResourceValidationArgs,
  ResourceValidationPolicy,
  StackValidationArgs,
  StackValidationPolicy,
  PolicyResource,
} from "@pulumi/policy";

const projectType = "aws:codebuild/project:Project";
const projectUrn = `urn:pulumi:test::example::${projectType}::runner`;
const roleArn = "arn:aws:iam::123456789012:role/isolated-runner";
const logArn = "arn:aws:logs:eu-west-2:123456789012:log-group:/hulumi/codebuild/isolated-runner:*";
const resources = (policy: unknown): PolicyResource[] =>
  [
    {
      type: projectType,
      name: "runner",
      urn: projectUrn,
      props: {
        serviceRole: roleArn,
        arn: "arn:aws:codebuild:eu-west-2:123456789012:project/isolated-runner",
        logsConfig: { cloudwatchLogs: { groupName: "/hulumi/codebuild/isolated-runner" } },
        environment: { privilegedMode: false },
      },
    },
    {
      type: "aws:iam/role:Role",
      name: "role",
      urn: "urn:role",
      props: { name: "isolated-runner", arn: roleArn },
    },
    {
      type: "aws:iam/rolePolicy:RolePolicy",
      name: "policy",
      urn: "urn:policy",
      props: { role: "isolated-runner", policy },
    },
  ].map((r) => ({
    dependencies: [],
    propertyDependencies: {},
    provider: {
      type: "pulumi:providers:aws",
      urn: "urn:provider:default",
      name: "default",
      props: {},
    },
    ...r,
  })) as unknown as PolicyResource[];
const safe = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: ["logs:CreateLogStream", "logs:DescribeLogStreams", "logs:PutLogEvents"],
      Resource: logArn,
    },
  ],
};
async function resourceCheck(name: string, props: object, config: object = {}) {
  const mod = (await import("../../src/platform")) as unknown as Record<string, unknown>;
  expect(mod[name]).toBeTypeOf("object");
  const rule = mod[name] as ResourceValidationPolicy;
  const violations: string[] = [];
  await (
    rule.validateResource as (args: ResourceValidationArgs, report: (s: string) => void) => unknown
  )(
    {
      type: projectType,
      name: "runner",
      urn: projectUrn,
      props,
      getConfig: () => config,
    } as ResourceValidationArgs,
    (s) => violations.push(s),
  );
  return violations;
}
async function roleCheck(rs: PolicyResource[]) {
  const mod = (await import("../../src/platform")) as unknown as Record<string, unknown>;
  expect(mod.codeBuildRunnerRoleBoundary).toBeTypeOf("object");
  const rule = mod.codeBuildRunnerRoleBoundary as StackValidationPolicy;
  const violations: string[] = [];
  await (rule.validateStack as (args: StackValidationArgs, report: (s: string) => void) => unknown)(
    { resources: rs, getConfig: () => ({}) } as StackValidationArgs,
    (s) => violations.push(s),
  );
  return violations;
}
describe("CodeBuild runner policy boundary", () => {
  it("accepts only inspectable own-log authority", async () => {
    expect(await roleCheck(resources(JSON.stringify(safe)))).toEqual([]);
  });
  it.each([
    "*",
    "logs:*",
    "sts:AssumeRole",
    "codeconnections:GetConnectionToken",
    "secretsmanager:GetSecretValue",
    "s3:GetObject",
  ])("denies authority expansion %s", async (action) => {
    expect(
      (
        await roleCheck(
          resources(
            JSON.stringify({ Statement: [{ Effect: "Allow", Action: action, Resource: "*" }] }),
          ),
        )
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    "not-json",
    "{}",
    JSON.stringify({ Statement: [{ Effect: "Allow", NotAction: "iam:*", Resource: "*" }] }),
    JSON.stringify({
      Statement: [{ Effect: "Allow", Action: "logs:PutLogEvents", Resource: "*" }],
    }),
    JSON.stringify({
      Statement: [
        {
          Effect: "Allow",
          Action: "logs:PutLogEvents",
          Resource: logArn.replace("123456789012", "999999999999"),
        },
      ],
    }),
  ])("denies malformed/unbounded role policy %s", async (policy) => {
    expect((await roleCheck(resources(policy))).length).toBeGreaterThan(0);
  });
  it("denies external roles and managed attachments instead of assuming they are safe", async () => {
    expect(
      (
        await roleCheck(
          resources(JSON.stringify(safe)).filter((r) => r.type !== "aws:iam/role:Role"),
        )
      ).length,
    ).toBeGreaterThan(0);
    const rs = resources(JSON.stringify(safe));
    rs[1].props = {
      arn: roleArn,
      name: "isolated-runner",
      managedPolicyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"],
    };
    expect((await roleCheck(rs)).length).toBeGreaterThan(0);
  });
  it("rejects exclusive managed policy attachments", async () => {
    const rs = resources(JSON.stringify(safe));
    rs.push({
      type: "aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive",
      name: "exclusive",
      urn: "urn:exclusive",
      props: {
        roleName: "isolated-runner",
        policyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"],
      },
    } as unknown as PolicyResource);
    expect((await roleCheck(rs)).length).toBeGreaterThan(0);
  });
  it("does not prove an external privileged role using another account's same-name role", async () => {
    const rs = resources(JSON.stringify(safe));
    rs[0].provider = { type: "pulumi:providers:aws", urn: "urn:provider:B", name: "B", props: {} };
    rs[1].provider = { type: "pulumi:providers:aws", urn: "urn:provider:A", name: "A", props: {} };
    rs[1].props.arn = roleArn.replace("123456789012", "999999999999");
    rs[2].provider = rs[1].provider;
    expect((await roleCheck(rs)).length).toBeGreaterThan(0);
  });
  it("rejects a same-ARN claim supplied under a different provider identity", async () => {
    const rs = resources(JSON.stringify(safe));
    rs[1].provider = {
      type: "pulumi:providers:aws",
      urn: "urn:other-provider",
      name: "other",
      props: {},
    };
    expect((await roleCheck(rs)).length).toBeGreaterThan(0);
  });
  it("fails closed when the role's resolved ARN cannot be inspected", async () => {
    const rs = resources(JSON.stringify(safe));
    delete rs[1].props.arn;
    expect((await roleCheck(rs)).length).toBeGreaterThan(0);
  });
  it.each([
    {
      type: "aws:iam/rolePolicyAttachment:RolePolicyAttachment",
      props: {
        role: "04da6b54-80e4-46f7-96ec-b56ff0331ba9",
        policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
      },
    },
    {
      type: "aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive",
      props: {
        roleName: "04da6b54-80e4-46f7-96ec-b56ff0331ba9",
        policyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"],
      },
    },
    {
      type: "aws:iam/policyAttachment:PolicyAttachment",
      props: {
        roles: "04da6b54-80e4-46f7-96ec-b56ff0331ba9",
        policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
      },
    },
    {
      type: "aws:iam/rolePolicy:RolePolicy",
      props: {
        role: "04da6b54-80e4-46f7-96ec-b56ff0331ba9",
        policy: JSON.stringify({ Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] }),
      },
    },
  ])("does not overlook an unresolved attachment/policy target %j", async (edge) => {
    const rs = resources(JSON.stringify(safe));
    rs.push({
      ...edge,
      name: "unresolved",
      urn: "urn:unresolved",
      provider: rs[0].provider,
    } as unknown as PolicyResource);
    expect((await roleCheck(rs)).length).toBeGreaterThan(0);
  });
  it("requires explicit reviewed exceptions for privilege and VPC exposure", async () => {
    expect(
      await resourceCheck("codeBuildRunnerPrivileged", { environment: { privilegedMode: false } }),
    ).toEqual([]);
    expect(
      (await resourceCheck("codeBuildRunnerPrivileged", { environment: { privilegedMode: true } }))
        .length,
    ).toBe(1);
    expect(
      (await resourceCheck("codeBuildRunnerNetwork", { vpcConfig: { vpcId: "vpc-prod" } })).length,
    ).toBe(1);
  });
  it.each([
    { urnScope: "*", reason: "approved", expiresAt: "2999-01-01T00:00:00Z" },
    { urnScope: projectUrn, reason: "", expiresAt: "2999-01-01T00:00:00Z" },
    { urnScope: projectUrn, reason: "approved", expiresAt: "not-a-date" },
    { urnScope: projectUrn, reason: "approved", expiresAt: "2020-01-01T00:00:00Z" },
  ])("does not hide findings under invalid/global/expired suppression %j", async (suppression) => {
    expect(
      (
        await resourceCheck(
          "codeBuildRunnerPrivileged",
          { environment: { privilegedMode: true } },
          {
            suppressions: [
              { ruleId: "CB_RUNNER_1_PRIVILEGED", owner: "security-team", ...suppression },
            ],
          },
        )
      ).length,
    ).toBe(1);
  });
  it("honors a valid exact-resource expiring exception only for its rule", async () => {
    const config = {
      suppressions: [
        {
          ruleId: "CB_RUNNER_1_PRIVILEGED",
          owner: "security-team",
          urnScope: projectUrn,
          reason: "owner-reviewed isolated Docker job",
          expiresAt: "2999-01-01T00:00:00Z",
        },
      ],
    };
    expect(
      await resourceCheck(
        "codeBuildRunnerPrivileged",
        { environment: { privilegedMode: true } },
        config,
      ),
    ).toEqual([]);
    expect(
      (await resourceCheck("codeBuildRunnerNetwork", { vpcConfig: { vpcId: "vpc-prod" } }, config))
        .length,
    ).toBe(1);
  });
});

describe("real constructor to production policy boundary", () => {
  it("accepts production-generated default resource inputs and detects tampering", async () => {
    const { registrations, resetRegistrations, settlePulumi, valueOf } =
      await import("../../../platform-patterns/tests/setup");
    const { CodeBuildGitHubRunner } = await import("../../../platform-patterns/src");
    resetRegistrations();
    const aws = await import("@pulumi/aws");
    const provider = new aws.Provider("policy-aws", { region: "eu-west-2" });
    const runner = new CodeBuildGitHubRunner(
      "policy-chain",
      {
        tier: "startup-hardened",
        owner: "example-org",
        repository: "example-repo",
        projectName: "policy-chain",
        sourceAuthentication: "existing-account-oauth",
      },
      { providers: { aws: provider } },
    );
    await valueOf(runner.projectName);
    await settlePulumi();
    const actual = registrations
      .filter((r) => r.type.startsWith("aws:"))
      .map((r) => ({
        type: r.type,
        name: r.name,
        urn: `urn:pulumi:test::example::${r.type}::${r.name}`,
        props: r.outputs ?? r.inputs,
        provider: {
          type: "pulumi:providers:aws",
          urn: r.provider ?? "",
          name: "captured",
          props: {},
        },
        dependencies: [],
        propertyDependencies: {},
      })) as unknown as PolicyResource[];
    expect(await roleCheck(actual)).toEqual([]);
    const project = actual.find((r) => r.type === projectType)!;
    expect(await resourceCheck("codeBuildRunnerPrivileged", project.props)).toEqual([]);
    expect(await resourceCheck("codeBuildRunnerNetwork", project.props)).toEqual([]);
    const exclusive = new aws.iam.RolePolicyAttachmentsExclusive(
      "exclusive-bypass",
      {
        roleName: "policy-chain-runner",
        policyArns: ["arn:aws:iam::aws:policy/AdministratorAccess"],
      },
      { provider },
    );
    await valueOf(exclusive.id);
    await settlePulumi();
    const exclusiveRegistration = registrations.find(
      (r) => r.type === "aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive",
    )!;
    expect(
      (
        await roleCheck([
          ...actual,
          {
            type: exclusiveRegistration.type,
            name: exclusiveRegistration.name,
            urn: "urn:exclusive",
            props: exclusiveRegistration.inputs,
          } as unknown as PolicyResource,
        ])
      ).length,
    ).toBeGreaterThan(0);
    const policy = actual.find((r) => r.type === "aws:iam/rolePolicy:RolePolicy")!;
    policy.props.policy = JSON.stringify({
      Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }],
    });
    expect((await roleCheck(actual)).length).toBeGreaterThan(0);
    resetRegistrations();
  });
});

describe("explicit risk expansions through actual construction", () => {
  it("flags real privileged/VPC/network-role inputs in independent rules", async () => {
    const { registrations, resetRegistrations, settlePulumi, valueOf } =
      await import("../../../platform-patterns/tests/setup");
    const { CodeBuildGitHubRunner } = await import("../../../platform-patterns/src");
    const aws = await import("@pulumi/aws");
    resetRegistrations();
    const provider = new aws.Provider("risky-aws", { region: "eu-west-2" });
    const runner = new CodeBuildGitHubRunner(
      "risky",
      {
        tier: "startup-hardened",
        owner: "example-org",
        repository: "example-repo",
        projectName: "risky-runner",
        sourceAuthentication: "existing-account-oauth",
        privilegedMode: true,
        vpc: { vpcId: "vpc-123abc", subnetIds: ["subnet-123abc"], securityGroupIds: ["sg-123abc"] },
      },
      { providers: { aws: provider } },
    );
    await valueOf(runner.projectName);
    await settlePulumi();
    const actual = registrations
      .filter((r) => r.type.startsWith("aws:"))
      .map((r) => ({
        type: r.type,
        name: r.name,
        urn: `urn:pulumi:test::risky::${r.type}::${r.name}`,
        props: r.outputs ?? r.inputs,
        provider: {
          type: "pulumi:providers:aws",
          urn: r.provider ?? "",
          name: "captured",
          props: {},
        },
      })) as unknown as PolicyResource[];
    const project = actual.find((r) => r.type === projectType)!;
    expect((await resourceCheck("codeBuildRunnerPrivileged", project.props)).length).toBe(1);
    expect((await resourceCheck("codeBuildRunnerNetwork", project.props)).length).toBe(1);
    expect((await roleCheck(actual)).length).toBeGreaterThan(0);
    resetRegistrations();
  });
});

describe("actual CrossGuard preview proxies", () => {
  it.each(["serviceRole", "arn", "roleName", "policy"])(
    "reports unknown %s and continues subsequent projects",
    async (field) => {
      const rs = resources(JSON.stringify(safe));
      if (field === "roleName")
        rs.push({
          type: "aws:iam/rolePolicyAttachmentsExclusive:RolePolicyAttachmentsExclusive",
          props: sdkProxy.unknownCheckingProxy({
            roleName: sdkProxy.unknownStringValue,
            policyArns: [],
          }),
        } as unknown as PolicyResource);
      else {
        const r = field === "policy" ? rs[2] : rs[0];
        r.props = sdkProxy.unknownCheckingProxy({
          ...r.props,
          [field]: sdkProxy.unknownStringValue,
        });
      }
      rs.push({
        ...resources(JSON.stringify(safe))[0],
        urn: `${projectUrn}-second`,
        props: { serviceRole: "external" },
      });
      expect(await roleCheck(rs)).toHaveLength(2);
    },
  );
  it("rejects SDK-proxied unknown privilege and VPC values", async () => {
    expect(
      await resourceCheck(
        "codeBuildRunnerPrivileged",
        sdkProxy.unknownCheckingProxy({
          environment: { privilegedMode: sdkProxy.unknownBooleanValue },
        }),
      ),
    ).toHaveLength(1);
    expect(
      await resourceCheck(
        "codeBuildRunnerNetwork",
        sdkProxy.unknownCheckingProxy({ vpcConfig: sdkProxy.unknownObjectValue }),
      ),
    ).toHaveLength(1);
  });
  it("rejects another region's identically named log group", async () => {
    const policy = JSON.stringify(safe).replace("eu-west-2", "us-east-1");
    expect(await roleCheck(resources(policy))).toHaveLength(1);
  });
});
