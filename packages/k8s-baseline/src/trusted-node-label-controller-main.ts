import { createTrustedNodeLabelAwsAdapter } from "./trusted-node-label-controller-aws";
import { createEksPodIdentityPatchTokenProvider } from "./trusted-node-label-controller-eks-auth";
import { createTrustedNodeLabelKubernetesAdapter } from "./trusted-node-label-controller-kubernetes";
import {
  runTrustedNodeLabelController,
  type TrustedNodeLabelControllerConfig,
} from "./trusted-node-label-controller";
import type { KubernetesTaint } from "./trusted-node-label-reconciler-core";

type ProcessEnvironment = Readonly<Record<string, string | undefined>>;
declare const module: { readonly exports: unknown };

const AWS_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:/+=,@-]{0,99}$/u;
const AWS_ACCOUNT = /^\d{12}$/u;
const AWS_REGION = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u;
const INSTANCE_TYPE = /^[a-z][a-z0-9.]{1,31}$/u;
const DNS_LABEL = /^[a-z0-9](?:[-a-z0-9]{0,61}[a-z0-9])?$/u;
const LABEL_NAME = /^(?=.{1,63}$)[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/u;
const LABEL_VALUE = /^(?=.{1,63}$)[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?$/u;
const METRIC_NAMESPACE = /^[A-Za-z0-9_./#-]{1,255}$/u;

export interface TrustedNodeLabelEnvironmentConfiguration {
  readonly controller: TrustedNodeLabelControllerConfig;
  readonly kubernetes: {
    readonly hostname: string;
    readonly port: number;
    readonly tokenPath: string;
    readonly caPath: string;
    readonly nodeGroupName: string;
    readonly maxNodesPerCycle: number;
  };
  readonly aws: {
    readonly clusterName: string;
    readonly nodeGroupName: string;
    readonly awsRegion: string;
    readonly metricNamespace: string;
  };
}

function required(env: ProcessEnvironment, name: string): string {
  const value = env[name]?.trim();
  if (value === undefined || value.length === 0 || value.length > 16 * 1024) {
    throw new Error(`trusted_node_label_config_invalid:${name}`);
  }
  return value;
}

function boundedInteger(
  env: ProcessEnvironment,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const value = required(env, name);
  if (!/^\d+$/u.test(value)) throw new Error(`trusted_node_label_config_invalid:${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`trusted_node_label_config_invalid:${name}`);
  }
  return parsed;
}

function jsonArray(env: ProcessEnvironment, name: string): unknown[] {
  const raw = required(env, name);
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`trusted_node_label_config_invalid:${name}`);
  }
  if (!Array.isArray(value)) throw new Error(`trusted_node_label_config_invalid:${name}`);
  return value;
}

function isProtectedLabelKey(value: string): boolean {
  const parts = value.split("/");
  if (parts.length !== 2 || !LABEL_NAME.test(parts[1])) return false;
  const prefix = parts[0];
  return (
    prefix.length <= 253 &&
    prefix.split(".").every((part) => DNS_LABEL.test(part)) &&
    (prefix === "node-restriction.kubernetes.io" ||
      prefix.endsWith(".node-restriction.kubernetes.io"))
  );
}

function exactPath(env: ProcessEnvironment, name: string): string {
  const value = required(env, name);
  if (!value.startsWith("/") || value.includes("\0") || value.length > 1_024) {
    throw new Error(`trusted_node_label_config_invalid:${name}`);
  }
  return value;
}

function instanceTypes(env: ProcessEnvironment): string[] {
  const values = jsonArray(env, "HULUMI_ALLOWED_INSTANCE_TYPES_JSON");
  if (
    values.length === 0 ||
    values.length > 16 ||
    values.some((value) => typeof value !== "string" || !INSTANCE_TYPE.test(value)) ||
    new Set(values).size !== values.length
  ) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_ALLOWED_INSTANCE_TYPES_JSON");
  }
  return values as string[];
}

function expectedTaints(env: ProcessEnvironment): KubernetesTaint[] {
  const values = jsonArray(env, "HULUMI_EXPECTED_TAINTS_JSON");
  if (values.length === 0 || values.length > 16) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_EXPECTED_TAINTS_JSON");
  }
  const taints = values.map((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("trusted_node_label_config_invalid:HULUMI_EXPECTED_TAINTS_JSON");
    }
    const taint = value as Record<string, unknown>;
    if (
      typeof taint.key !== "string" ||
      !LABEL_NAME.test(taint.key) ||
      typeof taint.value !== "string" ||
      !LABEL_VALUE.test(taint.value) ||
      (taint.effect !== "NoSchedule" &&
        taint.effect !== "PreferNoSchedule" &&
        taint.effect !== "NoExecute")
    ) {
      throw new Error("trusted_node_label_config_invalid:HULUMI_EXPECTED_TAINTS_JSON");
    }
    return {
      key: taint.key,
      value: taint.value,
      effect: taint.effect as KubernetesTaint["effect"],
    };
  });
  if (new Set(taints.map((taint) => `${taint.key}\0${taint.effect}`)).size !== taints.length) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_EXPECTED_TAINTS_JSON");
  }
  return taints;
}

export function trustedNodeLabelConfigurationFromEnvironment(
  env: ProcessEnvironment,
): TrustedNodeLabelEnvironmentConfiguration {
  const clusterName = required(env, "HULUMI_CLUSTER_NAME");
  const nodeGroupName = required(env, "HULUMI_NODE_GROUP_NAME");
  const awsRegion = required(env, "HULUMI_AWS_REGION");
  const awsAccountId = required(env, "HULUMI_AWS_ACCOUNT_ID");
  const metricNamespace = required(env, "HULUMI_METRIC_NAMESPACE");
  if (!AWS_NAME.test(clusterName)) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_CLUSTER_NAME");
  }
  if (!AWS_NAME.test(nodeGroupName)) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_NODE_GROUP_NAME");
  }
  if (!AWS_REGION.test(awsRegion)) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_AWS_REGION");
  }
  if (!AWS_ACCOUNT.test(awsAccountId)) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_AWS_ACCOUNT_ID");
  }
  if (!METRIC_NAMESPACE.test(metricNamespace) || metricNamespace.startsWith("AWS/")) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_METRIC_NAMESPACE");
  }
  const reconcileIntervalSeconds = boundedInteger(
    env,
    "HULUMI_RECONCILE_INTERVAL_SECONDS",
    15,
    900,
  );
  const maxEvidenceAgeSeconds = boundedInteger(env, "HULUMI_MAX_EVIDENCE_AGE_SECONDS", 15, 600);
  const maxEvidenceSkewSeconds = boundedInteger(env, "HULUMI_MAX_EVIDENCE_SKEW_SECONDS", 1, 60);
  const maxNodesPerCycle = boundedInteger(env, "HULUMI_MAX_NODES_PER_CYCLE", 1, 500);
  if (maxEvidenceSkewSeconds > maxEvidenceAgeSeconds) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_MAX_EVIDENCE_SKEW_SECONDS");
  }
  const labelKey = required(env, "HULUMI_PROTECTED_LABEL_KEY");
  const labelValue = required(env, "HULUMI_PROTECTED_LABEL_VALUE");
  if (!isProtectedLabelKey(labelKey)) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_PROTECTED_LABEL_KEY");
  }
  if (!LABEL_VALUE.test(labelValue)) {
    throw new Error("trusted_node_label_config_invalid:HULUMI_PROTECTED_LABEL_VALUE");
  }
  const hostname = required(env, "KUBERNETES_SERVICE_HOST");
  if (!/^[A-Za-z0-9.-]{1,253}$/u.test(hostname)) {
    throw new Error("trusted_node_label_config_invalid:KUBERNETES_SERVICE_HOST");
  }
  const portRaw = env.KUBERNETES_SERVICE_PORT_HTTPS?.trim() ?? "443";
  if (!/^\d+$/u.test(portRaw)) {
    throw new Error("trusted_node_label_config_invalid:KUBERNETES_SERVICE_PORT_HTTPS");
  }
  const port = Number(portRaw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("trusted_node_label_config_invalid:KUBERNETES_SERVICE_PORT_HTTPS");
  }
  return {
    controller: {
      reconcileIntervalMs: reconcileIntervalSeconds * 1_000,
      policy: {
        clusterName,
        nodeGroupName,
        awsAccountId,
        region: awsRegion,
        protectedLabelKey: labelKey,
        protectedLabelValue: labelValue,
        allowedInstanceTypes: instanceTypes(env),
        expectedTaints: expectedTaints(env),
        maxEvidenceAgeMs: maxEvidenceAgeSeconds * 1_000,
        maxEvidenceSkewMs: maxEvidenceSkewSeconds * 1_000,
      },
    },
    kubernetes: {
      hostname,
      port,
      tokenPath: exactPath(env, "HULUMI_KUBERNETES_TOKEN_PATH"),
      caPath: exactPath(env, "HULUMI_KUBERNETES_CA_PATH"),
      nodeGroupName,
      maxNodesPerCycle,
    },
    aws: { clusterName, nodeGroupName, awsRegion, metricNamespace },
  };
}

export async function runTrustedNodeLabelControllerFromEnvironment(
  env: ProcessEnvironment = process.env,
): Promise<void> {
  const config = trustedNodeLabelConfigurationFromEnvironment(env);
  const abort = new AbortController();
  const onSignal = (): void => abort.abort();
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    const aws = createTrustedNodeLabelAwsAdapter(config.aws);
    const patchTokenProvider = createEksPodIdentityPatchTokenProvider(
      { clusterName: config.aws.clusterName, region: config.aws.awsRegion },
      { environment: env },
    );
    const kubernetes = createTrustedNodeLabelKubernetesAdapter(
      config.kubernetes,
      patchTokenProvider,
    );
    await runTrustedNodeLabelController(config.controller, { aws, kubernetes }, abort.signal);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}

if (require.main === module) {
  runTrustedNodeLabelControllerFromEnvironment().catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : "unexpected_failure";
    console.error(JSON.stringify({ event: "controller_fatal", reason }));
    process.exitCode = 1;
  });
}
