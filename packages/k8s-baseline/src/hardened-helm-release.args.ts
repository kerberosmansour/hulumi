import type * as pulumi from "@pulumi/pulumi";

export type ChartClass = "default" | "istio";

export interface HardenedHelmReleaseArgs {
  /** Chart name within the repository (e.g. "nginx", "istiod"). */
  chart: string;

  /**
   * Exact chart version. No "latest", no "^1.0.0", no "~1.0.0", no ">=" —
   * Helm chart versions are exact. Refused at construction time otherwise.
   */
  version: string;

  /** Target namespace. */
  namespace: pulumi.Input<string>;

  /**
   * Chart repository URL. Must start with `https://` or `oci://`. Local
   * `file://` paths and bare repo names (which would lookup the consumer's
   * local `helm repo` list) are refused.
   */
  repository: string;

  /**
   * Helm release name. Defaults to the ComponentResource instance name
   * verbatim — no random suffix. The whole reason this wrapper exists is to
   * reverse Pulumi's "always add a random suffix" default; collisions
   * surface at IaC review.
   */
  releaseName?: string;

  /** Helm values to merge. */
  values?: pulumi.Inputs;

  /**
   * When true, this release contains a DaemonSet. The wrapper injects a
   * Fargate-exclusion `nodeAffinity` into `values.affinity` (unless the
   * consumer opts out via `excludeFargate: false`). If `values.affinity`
   * is already set, the wrapper refuses construction rather than silently
   * overwriting.
   */
  daemonSet?: boolean;

  /**
   * Inject the Fargate-exclusion affinity. Defaults to `true` when
   * `daemonSet: true`; ignored when `daemonSet` is false.
   */
  excludeFargate?: boolean;

  /**
   * Wait timeout in milliseconds. Defaults to 300_000 for `chartClass:
   * "default"`; 480_000 for `"istio"`.
   */
  waitTimeoutMs?: number;

  /**
   * Chart-class identifier. Drives the default `waitTimeoutMs`. The enum
   * grows additively as new chart classes are introduced (M2 adds
   * `"istio"`; existing values do not change).
   */
  chartClass?: ChartClass;
}
