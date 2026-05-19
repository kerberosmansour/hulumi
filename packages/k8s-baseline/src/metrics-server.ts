import * as pulumi from "@pulumi/pulumi";

import { HardenedHelmRelease } from "./hardened-helm-release";
import type { InsecureMetricsServerOptIn, MetricsServerArgs } from "./metrics-server.args";
import type { MetricsServerOutputs } from "./metrics-server.outputs";

export const METRICS_SERVER_COMPONENT_TYPE = "hulumi:k8s:MetricsServer";
export const METRICS_SERVER_CHART = "metrics-server";
export const METRICS_SERVER_REPOSITORY = "https://kubernetes-sigs.github.io/metrics-server/";
export const DEFAULT_METRICS_SERVER_CHART_VERSION = "3.13.0";
export const METRICS_SERVER_API_SERVICE_NAME = "v1beta1.metrics.k8s.io" as const;

function assertExactVersion(version: string): void {
  if (version.trim() === "") {
    throw new Error("MetricsServer: version must be a non-empty exact chart version");
  }
  if (version === "latest") {
    throw new Error('MetricsServer: version "latest" is forbidden; pin an exact chart version');
  }
  if (/^[\^~><=]/.test(version)) {
    throw new Error(
      `MetricsServer: version "${version}" uses a semver range; pin an exact chart version`,
    );
  }
}

function requireReason(
  field: string,
  optIn: InsecureMetricsServerOptIn | undefined,
): string | undefined {
  if (optIn === undefined) {
    return undefined;
  }
  if (optIn.enabled !== true) {
    throw new Error(`MetricsServer: ${field}.enabled must be true when supplied`);
  }
  if (optIn.reason.trim() === "") {
    throw new Error(`MetricsServer: ${field}.reason must be non-empty`);
  }
  return optIn.reason;
}

function validateArgs(args: MetricsServerArgs): void {
  assertExactVersion(args.version ?? DEFAULT_METRICS_SERVER_CHART_VERSION);
  if (args.releaseName !== undefined && args.releaseName.trim() === "") {
    throw new Error("MetricsServer: releaseName must be non-empty when supplied");
  }
  const extraArgs = args.extraArgs ?? [];
  for (const value of extraArgs) {
    if (value.trim() === "") {
      throw new Error("MetricsServer: extraArgs must not contain empty strings");
    }
  }
  if (hasKubeletInsecureTlsFlag(extraArgs) && args.insecureKubeletTls === undefined) {
    throw new Error(
      "MetricsServer: --kubelet-insecure-tls requires insecureKubeletTls with a non-empty reason",
    );
  }
  requireReason("insecureKubeletTls", args.insecureKubeletTls);
  requireReason("insecureApiServiceTls", args.insecureApiServiceTls);
}

const KUBELET_INSECURE_TLS_FLAG = "--kubelet-insecure-tls";

/**
 * pflag accepts a boolean flag either bare (`--kubelet-insecure-tls`) or as a
 * single argv token with an `=value` suffix (`--kubelet-insecure-tls=true`,
 * `=1`, `=t`, `=TRUE`, …). An exact-literal `Array.includes` of the bare flag
 * misses every `=value` form, letting the insecure flag reach Helm without the
 * mandatory `insecureKubeletTls` reason. Treat any of these forms — including a
 * contradictory explicit `=false` (the component owns this flag; passing it at
 * all is a misconfig that must surface the opt-in) — as the insecure flag.
 */
function hasKubeletInsecureTlsFlag(extraArgs: readonly string[]): boolean {
  return extraArgs.some(
    (a) => a === KUBELET_INSECURE_TLS_FLAG || a.startsWith(`${KUBELET_INSECURE_TLS_FLAG}=`),
  );
}

function setIfDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export class MetricsServer extends pulumi.ComponentResource implements MetricsServerOutputs {
  public readonly release: HardenedHelmRelease;
  public readonly releaseName: pulumi.Output<string>;
  public readonly namespace: pulumi.Output<string>;
  public readonly chartVersion: pulumi.Output<string>;
  public readonly apiServiceName: pulumi.Output<"v1beta1.metrics.k8s.io">;
  public readonly insecureKubeletTlsReason: pulumi.Output<string | undefined>;
  public readonly insecureApiServiceTlsReason: pulumi.Output<string | undefined>;
  public readonly status: MetricsServerOutputs["status"];

  constructor(name: string, args: MetricsServerArgs = {}, opts?: pulumi.ComponentResourceOptions) {
    super(METRICS_SERVER_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateArgs(args);

    const version = args.version ?? DEFAULT_METRICS_SERVER_CHART_VERSION;
    const namespace = args.namespace ?? "kube-system";
    const releaseName = args.releaseName ?? "metrics-server";
    const insecureKubeletTlsReason = requireReason("insecureKubeletTls", args.insecureKubeletTls);
    const insecureApiServiceTlsReason = requireReason(
      "insecureApiServiceTls",
      args.insecureApiServiceTls,
    );

    const chartArgs = [...(args.extraArgs ?? [])];
    if (args.insecureKubeletTls?.enabled === true && !hasKubeletInsecureTlsFlag(chartArgs)) {
      chartArgs.push(KUBELET_INSECURE_TLS_FLAG);
    }

    const values: Record<string, unknown> = {
      commonLabels: { "hulumi.dev/managed-by": "MetricsServer" },
      apiService: {
        create: true,
        insecureSkipTLSVerify: args.insecureApiServiceTls?.enabled === true,
      },
      tls: {
        type: "helm",
        helm: {
          lookup: true,
          certDurationDays: 365,
        },
      },
      args: chartArgs,
    };
    setIfDefined(values, "replicas", args.replicas);
    setIfDefined(values, "resources", args.resources);
    setIfDefined(values, "nodeSelector", args.nodeSelector);
    setIfDefined(values, "tolerations", args.tolerations);
    setIfDefined(values, "affinity", args.affinity);
    setIfDefined(values, "podLabels", args.podLabels);
    setIfDefined(values, "podAnnotations", args.podAnnotations);

    const helmArgs = {
      chart: METRICS_SERVER_CHART,
      version,
      namespace,
      repository: METRICS_SERVER_REPOSITORY,
      releaseName,
      values,
      ...(args.waitTimeoutMs !== undefined ? { waitTimeoutMs: args.waitTimeoutMs } : {}),
    };

    this.release = new HardenedHelmRelease(`${name}-metrics-server`, helmArgs, { parent: this });

    this.releaseName = this.release.releaseName;
    this.namespace = this.release.namespace;
    this.chartVersion = this.release.chartVersion;
    this.apiServiceName = pulumi.output(METRICS_SERVER_API_SERVICE_NAME);
    this.insecureKubeletTlsReason = pulumi.output(insecureKubeletTlsReason);
    this.insecureApiServiceTlsReason = pulumi.output(insecureApiServiceTlsReason);
    this.status = this.release.status;

    this.registerOutputs({
      releaseName: this.releaseName,
      namespace: this.namespace,
      chartVersion: this.chartVersion,
      apiServiceName: this.apiServiceName,
      insecureKubeletTlsReason: this.insecureKubeletTlsReason,
      insecureApiServiceTlsReason: this.insecureApiServiceTlsReason,
      status: this.status,
    });
  }
}
