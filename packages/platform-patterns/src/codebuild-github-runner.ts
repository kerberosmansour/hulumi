import * as aws from "@pulumi/aws";
import * as github from "@pulumi/github";
import * as pulumi from "@pulumi/pulumi";
import type { CodeBuildGitHubRunnerArgs } from "./codebuild-github-runner.args";
import type { CodeBuildGitHubRunnerOutputs } from "./codebuild-github-runner.outputs";
import { assertValidTier } from "./tier";

export const CODEBUILD_GITHUB_RUNNER_COMPONENT_TYPE = "hulumi:platform:CodeBuildGitHubRunner";
const fail = (field: string): never => {
  throw new Error(`CodeBuildGitHubRunner: invalid ${field}`);
};
function bounded(
  value: number | undefined,
  fallback: number,
  maximum: number,
  field: string,
  minimum = 1,
): number {
  const n = value ?? fallback;
  return Number.isInteger(n) && n >= minimum && n <= maximum ? n : fail(field);
}
function validate(args: CodeBuildGitHubRunnerArgs) {
  assertValidTier(args.tier);
  if (
    typeof args.owner !== "string" ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(args.owner)
  )
    fail("owner");
  if (
    typeof args.repository !== "string" ||
    !/^[A-Za-z0-9_.-]{1,100}$/.test(args.repository) ||
    [".", ".."].includes(args.repository) ||
    args.repository.endsWith(".git")
  )
    fail("repository");
  if (
    typeof args.projectName !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{1,47}$/.test(args.projectName)
  )
    fail("projectName");
  if (args.sourceAuthentication !== "existing-account-oauth") fail("sourceAuthentication");
  const architecture = args.architecture ?? "arm64";
  const size = args.instanceSize ?? "small";
  if (!["arm64", "x86_64"].includes(architecture)) fail("architecture");
  if (!["small", "medium", "large"].includes(size)) fail("instanceSize");
  if (args.privilegedMode !== undefined && typeof args.privilegedMode !== "boolean")
    fail("privilegedMode");
  if (![7, 14, 30].includes(args.logRetentionDays ?? 14)) fail("logRetentionDays");
  if (args.githubAuth?.token !== undefined && args.githubAuth.appAuth !== undefined)
    fail("githubAuth");
  if (
    args.repositoryVariableName !== undefined &&
    (!/^[A-Z_][A-Z0-9_]{0,63}$/.test(args.repositoryVariableName) ||
      args.repositoryVariableName.startsWith("GITHUB_"))
  )
    fail("repositoryVariableName");
  if (
    args.vpc !== undefined &&
    (!args.vpc ||
      !Array.isArray(args.vpc.subnetIds) ||
      args.vpc.subnetIds.length < 1 ||
      args.vpc.subnetIds.length > 16 ||
      !Array.isArray(args.vpc.securityGroupIds) ||
      args.vpc.securityGroupIds.length < 1 ||
      args.vpc.securityGroupIds.length > 5)
  )
    fail("vpc");
  return {
    architecture,
    size,
    build: bounded(args.buildTimeoutMinutes, 30, 120, "buildTimeoutMinutes", 5),
    queue: bounded(args.queuedTimeoutMinutes, 15, 60, "queuedTimeoutMinutes", 5),
    concurrency: bounded(args.concurrentBuildLimit, 1, 4, "concurrentBuildLimit"),
  };
}

/** Scoped infrastructure construction; live webhook/runner qualification is separate. */
export class CodeBuildGitHubRunner
  extends pulumi.ComponentResource
  implements CodeBuildGitHubRunnerOutputs
{
  public readonly projectName: pulumi.Output<string>;
  public readonly projectArn: pulumi.Output<string>;
  public readonly roleArn: pulumi.Output<string>;
  public readonly logGroupName: pulumi.Output<string>;
  public readonly runnerLabelTemplate: pulumi.Output<string>;
  public readonly recommendedLabels: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: CodeBuildGitHubRunnerArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    const cfg = validate(args);
    super(CODEBUILD_GITHUB_RUNNER_COMPONENT_TYPE, name, {}, opts);
    const context = pulumi
      .all([
        aws.getCallerIdentityOutput({}, { parent: this }).accountId,
        aws.getRegionOutput({}, { parent: this }).name,
      ])
      .apply(([account, region]) => {
        if (
          !/^\d{12}$/.test(account) ||
          !/^[a-z]{2}-[a-z0-9-]+-\d$/.test(region) ||
          /^(cn-|us-gov-)/.test(region)
        )
          fail("AWS provider context (commercial partition required)");
        return { account, region };
      });
    const tags = {
      "hulumi:tier": args.tier,
      "hulumi:component": CODEBUILD_GITHUB_RUNNER_COMPONENT_TYPE,
      "hulumi:purpose": "github-actions-runner",
      "hulumi:repository": `${args.owner}/${args.repository}`,
    };
    const logs = new aws.cloudwatch.LogGroup(
      `${name}-logs`,
      {
        name: `/hulumi/codebuild/${args.projectName}`,
        retentionInDays: args.logRetentionDays ?? 14,
        tags,
      },
      { parent: this },
    );
    const role = new aws.iam.Role(
      `${name}-role`,
      {
        name: `${args.projectName}-runner`,
        tags,
        assumeRolePolicy: context.apply(({ account, region }) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "codebuild.amazonaws.com" },
                Action: "sts:AssumeRole",
                Condition: {
                  StringEquals: { "aws:SourceAccount": account },
                  ArnEquals: {
                    "aws:SourceArn": `arn:aws:codebuild:${region}:${account}:project/${args.projectName}`,
                  },
                },
              },
            ],
          }),
        ),
      },
      { parent: this },
    );
    const logPolicy = new aws.iam.RolePolicy(
      `${name}-logs`,
      {
        role: role.id,
        policy: logs.arn.apply((arn) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: ["logs:CreateLogStream", "logs:DescribeLogStreams", "logs:PutLogEvents"],
                Resource: `${arn}:*`,
              },
            ],
          }),
        ),
      },
      { parent: this },
    );
    const vpc =
      args.vpc === undefined
        ? undefined
        : pulumi
            .output({
              vpcId: args.vpc.vpcId,
              subnets: pulumi.all([...args.vpc.subnetIds]),
              securityGroupIds: pulumi.all([...args.vpc.securityGroupIds]),
            })
            .apply((v) => {
              if (
                !/^vpc-[a-f0-9]+$/.test(v.vpcId) ||
                !v.subnets.every((s) => /^subnet-[a-f0-9]+$/.test(s)) ||
                !v.securityGroupIds.every((s) => /^sg-[a-f0-9]+$/.test(s)) ||
                new Set(v.subnets).size !== v.subnets.length ||
                new Set(v.securityGroupIds).size !== v.securityGroupIds.length
              )
                fail("vpc identifiers");
              return v;
            });
    const networkPolicy =
      vpc === undefined
        ? undefined
        : new aws.iam.RolePolicy(
            `${name}-network`,
            {
              role: role.id,
              policy: pulumi.all([context, vpc]).apply(([ctx, net]) =>
                JSON.stringify({
                  Version: "2012-10-17",
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: [
                        "ec2:CreateNetworkInterface",
                        "ec2:DeleteNetworkInterface",
                        "ec2:DescribeNetworkInterfaces",
                        "ec2:DescribeSecurityGroups",
                        "ec2:DescribeSubnets",
                        "ec2:DescribeVpcs",
                        "ec2:DescribeDhcpOptions",
                      ],
                      Resource: "*",
                    },
                    {
                      Effect: "Allow",
                      Action: "ec2:CreateNetworkInterfacePermission",
                      Resource: `arn:aws:ec2:${ctx.region}:${ctx.account}:network-interface/*`,
                      Condition: {
                        StringEquals: {
                          "ec2:AuthorizedService": "codebuild.amazonaws.com",
                          "ec2:Subnet": net.subnets.map(
                            (id) => `arn:aws:ec2:${ctx.region}:${ctx.account}:subnet/${id}`,
                          ),
                        },
                      },
                    },
                  ],
                }),
              ),
            },
            { parent: this },
          );
    const project = new aws.codebuild.Project(
      `${name}-project`,
      {
        name: args.projectName,
        serviceRole: role.arn,
        buildTimeout: cfg.build,
        queuedTimeout: cfg.queue,
        concurrentBuildLimit: cfg.concurrency,
        artifacts: { type: "NO_ARTIFACTS" },
        cache: { type: "NO_CACHE" },
        environment: {
          type: cfg.architecture === "arm64" ? "ARM_CONTAINER" : "LINUX_CONTAINER",
          image:
            cfg.architecture === "arm64"
              ? "aws/codebuild/amazonlinux-aarch64-standard:3.0"
              : "aws/codebuild/standard:7.0",
          computeType: `BUILD_GENERAL1_${cfg.size.toUpperCase()}`,
          imagePullCredentialsType: "CODEBUILD",
          privilegedMode: args.privilegedMode ?? false,
        },
        logsConfig: {
          cloudwatchLogs: { status: "ENABLED", groupName: logs.name, streamName: args.projectName },
        },
        source: {
          type: "GITHUB",
          location: `https://github.com/${args.owner}/${args.repository}.git`,
        },
        ...(vpc === undefined ? {} : { vpcConfig: vpc }),
        tags,
      },
      {
        parent: this,
        dependsOn: [logPolicy, ...(networkPolicy === undefined ? [] : [networkPolicy])],
      },
    );
    const webhook = new aws.codebuild.Webhook(
      `${name}-trigger`,
      {
        projectName: project.name,
        manualCreation: true,
        buildType: "BUILD",
        filterGroups: [{ filters: [{ type: "EVENT", pattern: "WORKFLOW_JOB_QUEUED" }] }],
      },
      { parent: this, additionalSecretOutputs: ["secret"] },
    );
    const githubProvider = new github.Provider(
      `${name}-github`,
      {
        owner: args.owner,
        baseUrl: "https://api.github.com/",
        ...(args.githubAuth?.token === undefined
          ? {}
          : { token: pulumi.secret(args.githubAuth.token) }),
        ...(args.githubAuth?.appAuth === undefined
          ? {}
          : { appAuth: pulumi.secret(args.githubAuth.appAuth) }),
      },
      { parent: this },
    );
    const configuration = pulumi
      .all([webhook.payloadUrl, webhook.secret])
      .apply(([url, secret]) => {
        if (
          typeof url !== "string" ||
          !url.startsWith("https://") ||
          typeof secret !== "string" ||
          secret.length < 1
        )
          fail("manual webhook response");
        return { url, contentType: "json", insecureSsl: false, secret };
      });
    new github.RepositoryWebhook(
      `${name}-github-trigger`,
      {
        repository: args.repository,
        active: true,
        events: ["workflow_job"],
        configuration: pulumi.secret(configuration),
      },
      { parent: this, provider: githubProvider },
    );
    if (args.repositoryVariableName !== undefined)
      new github.ActionsVariable(
        `${name}-variable`,
        {
          repository: args.repository,
          variableName: args.repositoryVariableName,
          value: project.name,
        },
        { parent: this, provider: githubProvider },
      );
    this.projectName = project.name;
    this.projectArn = project.arn;
    this.roleArn = role.arn;
    this.logGroupName = logs.name;
    this.runnerLabelTemplate = project.name.apply(
      (p) => `codebuild-${p}-` + "${{ github.run_id }}-${{ github.run_attempt }}",
    );
    this.recommendedLabels = this.runnerLabelTemplate.apply((label) => [
      label,
      cfg.architecture === "arm64" ? "image:arm-3.0" : "image:linux-7.0",
      `instance-size:${cfg.size}`,
    ]);
    this.registerOutputs({
      projectName: this.projectName,
      projectArn: this.projectArn,
      roleArn: this.roleArn,
      logGroupName: this.logGroupName,
      runnerLabelTemplate: this.runnerLabelTemplate,
      recommendedLabels: this.recommendedLabels,
    });
  }
}
