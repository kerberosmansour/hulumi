import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  LocalWorkspace,
  PulumiCommand,
  type InlineProgramArgs,
  type Stack,
} from "@pulumi/pulumi/automation";
import { describe, expect, it } from "vitest";

import {
  qualificationProgram,
  type QualificationProgramArgs,
} from "../../../../../examples/eks-trusted-node-label-reconciler-live/program";

const enabled = process.env["HULUMI_INTEGRATION_EKS"] === "1";
const teardownOnly = process.env["HULUMI_TEARDOWN_ONLY"] === "1";
const verifyTeardown = process.env["HULUMI_VERIFY_TEARDOWN"] === "1";
const region = process.env["AWS_REGION"] ?? "";
const runId = process.env["HULUMI_EKS_STACK_NAME"] ?? "";
const controllerImage = process.env["HULUMI_CONTROLLER_IMAGE"] ?? "";
const publicCidr = process.env["HULUMI_EKS_PUBLIC_CIDR"] ?? "";
const reportPath = process.env["HULUMI_QUALIFICATION_REPORT"] ?? "";
const projectName = "hulumi-eks-trusted-node-label-qualification";
const workDir = resolve(process.env["RUNNER_TEMP"] ?? "/tmp", `hulumi-${runId}`);
const pulumiHome = resolve(process.env["RUNNER_TEMP"] ?? "/tmp", "hulumi-pulumi-home");
const requiredImage =
  /^ghcr\.io\/kerberosmansour\/hulumi-trusted-node-label-reconciler@sha256:[a-f0-9]{64}$/u;
const requiredRunId = /^hulumi-nlr-[0-9]+-[0-9]+$/u;

interface LiveOutputs {
  readonly admissionPolicyName: string;
  readonly clusterName: string;
  readonly controllerRoleArn: string;
  readonly deploymentName: string;
  readonly metricNamespace: string;
  readonly namespaceName: string;
  readonly nodeGroupName: string;
  readonly protectedLabelKey: string;
  readonly protectedLabelValue: string;
  readonly runId: string;
}

interface QualificationReport {
  stack: string;
  imageDigest: string;
  initialLabelSeconds?: number;
  rollingRecoverySeconds?: number;
  scaleFromZeroSeconds?: number;
  checks: string[];
}

function command(name: string, args: readonly string[], timeout = 120_000): string {
  return execFileSync(name, [...args], {
    encoding: "utf8",
    env: { ...process.env, AWS_PAGER: "" },
    maxBuffer: 4 * 1024 * 1024,
    timeout,
  }).trim();
}

function aws(args: readonly string[], timeout?: number): string {
  return command("aws", [...args, "--region", region], timeout);
}

function kubectl(kubeconfig: string, args: readonly string[], timeout?: number): string {
  return command("kubectl", ["--kubeconfig", kubeconfig, ...args], timeout);
}

function requiredEnvironment(): QualificationProgramArgs {
  if (!requiredRunId.test(runId)) throw new Error("invalid exact qualification stack name");
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-[0-9]$/u.test(region)) throw new Error("invalid AWS region");
  if (!requiredImage.test(controllerImage)) throw new Error("invalid immutable controller image");
  if (!/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}\/32$/u.test(publicCidr)) {
    throw new Error("invalid bounded runner CIDR");
  }
  const accountId = command("aws", [
    "sts",
    "get-caller-identity",
    "--query",
    "Account",
    "--output",
    "text",
  ]);
  if (!/^\d{12}$/u.test(accountId)) throw new Error("invalid sandbox account identity");
  return { accountId, controllerImage, publicCidr, region, runId };
}

async function stackArgs(): Promise<{
  args: InlineProgramArgs;
  opts: Parameters<typeof LocalWorkspace.createOrSelectStack>[1];
}> {
  const inputs = requiredEnvironment();
  mkdirSync(workDir, { recursive: true });
  mkdirSync(pulumiHome, { recursive: true });
  const pulumiCommand = await PulumiCommand.get();
  return {
    args: { projectName, stackName: runId, program: qualificationProgram(inputs) },
    opts: {
      envVars: {
        AWS_DEFAULT_REGION: region,
        AWS_EC2_METADATA_DISABLED: "true",
        AWS_REGION: region,
        PULUMI_BACKEND_URL: process.env["PULUMI_BACKEND_URL"] ?? "",
        PULUMI_CONFIG_PASSPHRASE: process.env["PULUMI_CONFIG_PASSPHRASE"] ?? "",
      },
      pulumiCommand,
      pulumiHome,
      workDir,
    },
  };
}

async function selectExactStack(): Promise<Stack | undefined> {
  const { args, opts } = await stackArgs();
  try {
    return await LocalWorkspace.selectStack(args, opts);
  } catch (error) {
    if (String(error).includes("no stack named") || String(error).includes("not found"))
      return undefined;
    throw error;
  }
}

function outputValue<T>(outputs: Awaited<ReturnType<Stack["outputs"]>>, key: string): T {
  const entry = outputs[key];
  if (entry === undefined) throw new Error(`missing Pulumi output ${key}`);
  return entry.value as T;
}

function liveOutputs(outputs: Awaited<ReturnType<Stack["outputs"]>>): LiveOutputs {
  return {
    admissionPolicyName: outputValue(outputs, "admissionPolicyName"),
    clusterName: outputValue(outputs, "clusterName"),
    controllerRoleArn: outputValue(outputs, "controllerRoleArn"),
    deploymentName: outputValue(outputs, "deploymentName"),
    metricNamespace: outputValue(outputs, "metricNamespace"),
    namespaceName: outputValue(outputs, "namespaceName"),
    nodeGroupName: outputValue(outputs, "nodeGroupName"),
    protectedLabelKey: outputValue(outputs, "protectedLabelKey"),
    protectedLabelValue: outputValue(outputs, "protectedLabelValue"),
    runId: outputValue(outputs, "runId"),
  };
}

function kubeconfigFor(outputs: LiveOutputs): string {
  const path = resolve(process.env["RUNNER_TEMP"] ?? "/tmp", `${runId}-kubeconfig`);
  aws([
    "eks",
    "update-kubeconfig",
    "--name",
    outputs.clusterName,
    "--kubeconfig",
    path,
    "--alias",
    runId,
  ]);
  return path;
}

function nodeSnapshot(
  kubeconfig: string,
  outputs: LiveOutputs,
): { name: string; uid: string } | undefined {
  const raw = kubectl(kubeconfig, ["get", "nodes", "-o", "json"]);
  const document = JSON.parse(raw) as {
    items?: Array<{ metadata?: { labels?: Record<string, string>; name?: string; uid?: string } }>;
  };
  const nodes = (document.items ?? []).filter(
    (node) => node.metadata?.labels?.[outputs.protectedLabelKey] === outputs.protectedLabelValue,
  );
  if (nodes.length !== 1) return undefined;
  const name = nodes[0]?.metadata?.name;
  const uid = nodes[0]?.metadata?.uid;
  return name !== undefined && uid !== undefined ? { name, uid } : undefined;
}

async function waitFor<T>(
  label: string,
  timeoutMs: number,
  read: () => T | undefined,
): Promise<{ value: T; seconds: number }> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const value = read();
    if (value !== undefined) return { value, seconds: Math.ceil((Date.now() - started) / 1000) };
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 5_000));
  }
  throw new Error(`${label} exceeded ${Math.ceil(timeoutMs / 1000)} seconds`);
}

function waitForEksUpdate(clusterName: string, nodeGroupName: string, updateId: string): void {
  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() <= deadline) {
    const status = aws([
      "eks",
      "describe-update",
      "--name",
      clusterName,
      "--nodegroup-name",
      nodeGroupName,
      "--update-id",
      updateId,
      "--query",
      "update.status",
      "--output",
      "text",
    ]);
    if (status === "Successful") return;
    if (status === "Failed" || status === "Cancelled")
      throw new Error(`EKS update ${updateId} ${status}`);
    command("sleep", ["10"]);
  }
  throw new Error(`EKS update ${updateId} timed out`);
}

function updateScaling(outputs: LiveOutputs, desired: number): void {
  const updateId = aws([
    "eks",
    "update-nodegroup-config",
    "--cluster-name",
    outputs.clusterName,
    "--nodegroup-name",
    outputs.nodeGroupName,
    "--scaling-config",
    `minSize=0,desiredSize=${desired},maxSize=1`,
    "--query",
    "update.id",
    "--output",
    "text",
  ]);
  waitForEksUpdate(outputs.clusterName, outputs.nodeGroupName, updateId);
}

function assertRuntimeBoundary(kubeconfig: string, outputs: LiveOutputs): string {
  kubectl(
    kubeconfig,
    [
      "-n",
      outputs.namespaceName,
      "rollout",
      "status",
      `deployment/${outputs.deploymentName}`,
      "--timeout=5m",
    ],
    330_000,
  );
  const pod = kubectl(kubeconfig, [
    "-n",
    outputs.namespaceName,
    "get",
    "pod",
    "-l",
    "app.kubernetes.io/component=trusted-node-label-reconciler",
    "-o",
    "jsonpath={.items[0].metadata.name}",
  ]);
  const podJson = JSON.parse(
    kubectl(kubeconfig, ["-n", outputs.namespaceName, "get", "pod", pod, "-o", "json"]),
  ) as {
    spec?: {
      containers?: Array<{
        env?: Array<{ name?: string; value?: string }>;
        securityContext?: Record<string, unknown>;
      }>;
      securityContext?: { runAsGroup?: number; runAsNonRoot?: boolean; runAsUser?: number };
    };
    status?: { containerStatuses?: Array<{ imageID?: string }> };
  };
  const imageDigest = controllerImage.slice(controllerImage.indexOf("@") + 1);
  expect(podJson.status?.containerStatuses?.[0]?.imageID).toContain(imageDigest);
  expect(podJson.spec?.securityContext).toMatchObject({
    runAsGroup: 65532,
    runAsNonRoot: true,
    runAsUser: 65532,
  });
  expect(podJson.spec?.containers?.[0]?.securityContext).toMatchObject({
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    runAsNonRoot: true,
  });
  expect(podJson.spec?.containers?.[0]?.env).toEqual(
    expect.arrayContaining([{ name: "AWS_EC2_METADATA_DISABLED", value: "true" }]),
  );
  const runtimeIdentity = kubectl(kubeconfig, [
    "-n",
    outputs.namespaceName,
    "exec",
    pod,
    "--",
    "node",
    "-e",
    "process.stdout.write(JSON.stringify({uid:process.getuid(),podIdentity:Boolean(process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI)}))",
  ]);
  expect(JSON.parse(runtimeIdentity)).toEqual({ podIdentity: true, uid: 65532 });
  return pod;
}

function assertAdmission(kubeconfig: string, outputs: LiveOutputs, nodeName: string): void {
  let foreignDenied = false;
  try {
    kubectl(kubeconfig, [
      "label",
      "node",
      nodeName,
      `${outputs.protectedLabelKey}=foreign`,
      "--overwrite",
    ]);
  } catch {
    foreignDenied = true;
  }
  expect(foreignDenied).toBe(true);
  let piggybackDenied = false;
  try {
    kubectl(kubeconfig, [
      "--as",
      `system:serviceaccount:${outputs.namespaceName}:trusted-label-reconciler`,
      "patch",
      "node",
      nodeName,
      "--type=json",
      "-p",
      JSON.stringify([
        { op: "add", path: "/metadata/annotations/hulumi.dev~1piggyback", value: "denied" },
      ]),
    ]);
  } catch {
    piggybackDenied = true;
  }
  expect(piggybackDenied).toBe(true);
}

function beginRollingReplacement(outputs: LiveOutputs): void {
  const launchTemplateId = aws([
    "eks",
    "describe-nodegroup",
    "--cluster-name",
    outputs.clusterName,
    "--nodegroup-name",
    outputs.nodeGroupName,
    "--query",
    "nodegroup.launchTemplate.id",
    "--output",
    "text",
  ]);
  const version = aws([
    "ec2",
    "create-launch-template-version",
    "--launch-template-id",
    launchTemplateId,
    "--source-version",
    "$Latest",
    "--version-description",
    runId,
    "--query",
    "LaunchTemplateVersion.VersionNumber",
    "--output",
    "text",
  ]);
  const updateId = aws([
    "eks",
    "update-nodegroup-version",
    "--cluster-name",
    outputs.clusterName,
    "--nodegroup-name",
    outputs.nodeGroupName,
    "--launch-template",
    `id=${launchTemplateId},version=${version}`,
    "--force",
    "--query",
    "update.id",
    "--output",
    "text",
  ]);
  waitForEksUpdate(outputs.clusterName, outputs.nodeGroupName, updateId);
}

function assertTelemetryAndAudit(kubeconfig: string, outputs: LiveOutputs, pod: string): void {
  const alarms = JSON.parse(
    aws([
      "cloudwatch",
      "describe-alarms",
      "--alarm-name-prefix",
      "trusted-label-",
      "--output",
      "json",
    ]),
  ) as { MetricAlarms?: unknown[] };
  expect(alarms.MetricAlarms?.length).toBe(2);
  const metrics = JSON.parse(
    aws([
      "cloudwatch",
      "list-metrics",
      "--namespace",
      outputs.metricNamespace,
      "--dimensions",
      `Name=ClusterName,Value=${outputs.clusterName}`,
      `Name=NodeGroupName,Value=${outputs.nodeGroupName}`,
      "--output",
      "json",
    ]),
  ) as { Metrics?: unknown[] };
  expect(metrics.Metrics?.length).toBeGreaterThanOrEqual(3);
  const logs = kubectl(kubeconfig, ["-n", outputs.namespaceName, "logs", pod, "--tail=200"]);
  expect(logs).not.toMatch(
    /(?:AKIA|ASIA)[A-Z0-9]{16}|authorization|bearer\s|secretaccesskey|sessiontoken/iu,
  );
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const events = JSON.parse(
    aws([
      "cloudtrail",
      "lookup-events",
      "--start-time",
      since,
      "--max-results",
      "50",
      "--output",
      "json",
    ]),
  ) as { Events?: Array<{ CloudTrailEvent?: string; EventName?: string }> };
  const controllerEvents = (events.Events ?? []).filter((event) => {
    if (event.CloudTrailEvent === undefined) return false;
    const payload = JSON.parse(event.CloudTrailEvent) as {
      userIdentity?: { sessionContext?: { sessionIssuer?: { arn?: string } } };
    };
    return payload.userIdentity?.sessionContext?.sessionIssuer?.arn === outputs.controllerRoleArn;
  });
  const names = new Set(
    controllerEvents
      .map((event) => event.EventName)
      .filter((name): name is string => name !== undefined),
  );
  const allowed = new Set(["DescribeNodegroup", "DescribeAutoScalingGroups", "DescribeInstances"]);
  expect([...names].every((name) => allowed.has(name))).toBe(true);
  for (const required of allowed) expect(names.has(required)).toBe(true);
}

async function destroyExactStack(): Promise<void> {
  const stack = await selectExactStack();
  if (stack === undefined) return;
  await stack.destroy({ onOutput: () => undefined });
  await stack.workspace.removeStack(stack.name);
}

async function assertEmptyInventory(): Promise<void> {
  const { opts } = await stackArgs();
  const workspace = await LocalWorkspace.create(opts ?? {});
  const stacks = await workspace.listStacks();
  expect(stacks.some((stack) => stack.name === runId || stack.name.endsWith(`/${runId}`))).toBe(
    false,
  );
  const clusters = JSON.parse(aws(["eks", "list-clusters", "--output", "json"])) as {
    clusters?: string[];
  };
  expect(clusters.clusters).not.toContain(`${runId}-cluster`);
  const tagged = JSON.parse(
    aws([
      "resourcegroupstaggingapi",
      "get-resources",
      "--tag-filters",
      `Key=hulumi:qualification-id,Values=${runId}`,
      "--output",
      "json",
    ]),
  ) as { ResourceTagMappingList?: unknown[] };
  expect(tagged.ResourceTagMappingList ?? []).toHaveLength(0);
}

describe("Feature: trusted node-label reconciler live EKS qualification", () => {
  it.skipIf(!enabled)("uses an explicit live-only gate", () => {
    expect(enabled).toBe(true);
  });

  it.skipIf(!enabled || !teardownOnly)(
    "destroys only the exact run-scoped stack",
    async () => {
      await destroyExactStack();
      if (verifyTeardown) await assertEmptyInventory();
    },
    20 * 60_000,
  );

  it.skipIf(!enabled || teardownOnly)(
    "recovers trusted identity across rolling and zero-capacity journeys",
    async () => {
      const report: QualificationReport = {
        checks: [],
        imageDigest: controllerImage.slice(controllerImage.indexOf("@") + 1),
        stack: runId,
      };
      if (reportPath.length > 0)
        writeFileSync(reportPath, `${JSON.stringify(report, undefined, 2)}\n`, { mode: 0o600 });
      const { args, opts } = await stackArgs();
      const stack = await LocalWorkspace.createOrSelectStack(args, opts);
      await stack.setConfig("aws:region", { value: region });
      await stack.workspace.installPlugin("aws", "7.50.0");
      await stack.workspace.installPlugin("kubernetes", "4.34.2");
      const up = await stack.up({ onOutput: () => undefined });
      expect(up.summary.result).toBe("succeeded");
      const outputs = liveOutputs(await stack.outputs());
      expect(outputs.runId).toBe(runId);
      const kubeconfig = kubeconfigFor(outputs);
      const initial = await waitFor("initial trusted label", 180_000, () =>
        nodeSnapshot(kubeconfig, outputs),
      );
      report.initialLabelSeconds = initial.seconds;
      assertRuntimeBoundary(kubeconfig, outputs);
      assertAdmission(kubeconfig, outputs, initial.value.name);
      report.checks.push("digest-runtime-pod-identity", "admission-deny");

      beginRollingReplacement(outputs);
      const rolled = await waitFor("rolling replacement recovery", 180_000, () => {
        const candidate = nodeSnapshot(kubeconfig, outputs);
        return candidate !== undefined && candidate.uid !== initial.value.uid
          ? candidate
          : undefined;
      });
      report.rollingRecoverySeconds = rolled.seconds;
      report.checks.push("rolling-replacement");

      updateScaling(outputs, 0);
      await waitFor("zero-capacity node removal", 180_000, () => {
        const raw = kubectl(kubeconfig, [
          "get",
          "nodes",
          "-o",
          "jsonpath={.items[*].metadata.uid}",
        ]);
        return raw.length === 0 ? true : undefined;
      });
      updateScaling(outputs, 1);
      const scaled = await waitFor("scale-from-zero recovery", 180_000, () => {
        const candidate = nodeSnapshot(kubeconfig, outputs);
        return candidate !== undefined && candidate.uid !== rolled.value.uid
          ? candidate
          : undefined;
      });
      report.scaleFromZeroSeconds = scaled.seconds;
      report.checks.push("zero-capacity", "scale-from-zero");

      const recoveredPod = assertRuntimeBoundary(kubeconfig, outputs);
      assertTelemetryAndAudit(kubeconfig, outputs, recoveredPod);
      report.checks.push("metrics-alarms-logs-cloudtrail");
      if (reportPath.length > 0)
        writeFileSync(reportPath, `${JSON.stringify(report, undefined, 2)}\n`, { mode: 0o600 });
    },
    45 * 60_000,
  );
});
