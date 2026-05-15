import type * as pulumi from "@pulumi/pulumi";

export interface InsecureMetricsServerOptIn {
  /** Must be true to enable the insecure option. */
  enabled: true;

  /** Human-readable reason recorded in the component outputs and chart values. */
  reason: string;
}

export interface MetricsServerArgs {
  /**
   * Exact metrics-server chart version. Defaults to the latest version tested
   * by Hulumi. No "latest", no semver ranges.
   */
  version?: string;

  /** Target namespace. Defaults to `kube-system`. */
  namespace?: pulumi.Input<string>;

  /** Stable Helm release name. Defaults to `metrics-server`. */
  releaseName?: string;

  /** Pod replica count. Defaults to the chart default. */
  replicas?: pulumi.Input<number>;

  /** Resource requests/limits passed to the metrics-server container. */
  resources?: pulumi.Inputs;

  /** Extra command-line args appended after the chart defaults. */
  extraArgs?: string[];

  /** Optional node selector for the deployment. */
  nodeSelector?: pulumi.Inputs;

  /** Optional tolerations for the deployment. */
  tolerations?: pulumi.Inputs;

  /** Optional affinity for the deployment. */
  affinity?: pulumi.Inputs;

  /** Optional labels added to the metrics-server pods. */
  podLabels?: pulumi.Inputs;

  /** Optional annotations added to the metrics-server pods. */
  podAnnotations?: pulumi.Inputs;

  /**
   * Permit `--kubelet-insecure-tls`. Refused unless an explicit reason is
   * supplied through this opt-in.
   */
  insecureKubeletTls?: InsecureMetricsServerOptIn;

  /**
   * Permit APIService TLS verification to be skipped. Defaults to false; the
   * component uses chart-managed TLS (`tls.type: helm`) by default.
   */
  insecureApiServiceTls?: InsecureMetricsServerOptIn;

  /** Wait timeout in milliseconds. Defaults to the hardened Helm default. */
  waitTimeoutMs?: number;
}
