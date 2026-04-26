import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

import type { ChartClass, HardenedHelmReleaseArgs } from "./hardened-helm-release.args";
import type { HardenedHelmReleaseOutputs } from "./hardened-helm-release.outputs";
import { assertVersionTested } from "./compatibility";

export const HARDENED_HELM_RELEASE_COMPONENT_TYPE = "hulumi:k8s:HardenedHelmRelease";

const DEFAULT_TIMEOUT_MS_BY_CLASS: Record<ChartClass, number> = {
  default: 300_000,
  istio: 480_000,
};

const FARGATE_EXCLUSION_AFFINITY = {
  nodeAffinity: {
    requiredDuringSchedulingIgnoredDuringExecution: {
      nodeSelectorTerms: [
        {
          matchExpressions: [
            {
              key: "eks.amazonaws.com/compute-type",
              operator: "NotIn",
              values: ["fargate"],
            },
          ],
        },
      ],
    },
  },
} as const;

function validateArgs(name: string, args: HardenedHelmReleaseArgs): void {
  if (args.chart === undefined || args.chart.trim() === "") {
    throw new Error("HardenedHelmRelease: chart is required and must be non-empty");
  }
  if (args.version === undefined || args.version === null) {
    throw new Error(
      'HardenedHelmRelease: version is required and must be an exact chart version (no "latest", no semver ranges)',
    );
  }
  if (typeof args.version !== "string" || args.version.trim() === "") {
    throw new Error('HardenedHelmRelease: version must be a non-empty exact string (no "latest")');
  }
  if (args.version === "latest") {
    throw new Error(
      'HardenedHelmRelease: version "latest" is forbidden — pin to an exact chart version (see packages/k8s-baseline/COMPATIBILITY.md)',
    );
  }
  if (/^[\^~><=]/.test(args.version)) {
    throw new Error(
      `HardenedHelmRelease: version "${args.version}" uses a semver range; Helm chart versions are exact (no "^", "~", ">=", "<="). Pin to an exact version.`,
    );
  }
  if (
    args.repository === undefined ||
    typeof args.repository !== "string" ||
    args.repository.trim() === ""
  ) {
    throw new Error(
      "HardenedHelmRelease: repository is required and must be a non-empty URL starting with https:// or oci://",
    );
  }
  if (!/^(https:\/\/|oci:\/\/)/.test(args.repository)) {
    throw new Error(
      `HardenedHelmRelease: repository "${args.repository}" must start with https:// or oci:// (no file://, no bare repo names — Hulumi never relies on the consumer's local helm repo list)`,
    );
  }
  if (args.daemonSet === true && args.excludeFargate !== false) {
    const values = (args.values as Record<string, unknown> | undefined) ?? {};
    if (values.affinity !== undefined) {
      throw new Error(
        "HardenedHelmRelease: cannot inject Fargate-exclusion affinity because values.affinity is already set; merge manually or set excludeFargate: false",
      );
    }
  }
  if (args.releaseName !== undefined && args.releaseName.trim() === "") {
    throw new Error(
      `HardenedHelmRelease: releaseName must be a non-empty string when supplied (got empty for component "${name}")`,
    );
  }
}

export class HardenedHelmRelease
  extends pulumi.ComponentResource
  implements HardenedHelmReleaseOutputs
{
  public readonly release: k8s.helm.v3.Release;
  public readonly releaseName: pulumi.Output<string>;
  public readonly namespace: pulumi.Output<string>;
  public readonly status: pulumi.Output<k8s.types.output.helm.v3.ReleaseStatus>;
  public readonly chartVersion: pulumi.Output<string>;

  constructor(
    name: string,
    args: HardenedHelmReleaseArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(HARDENED_HELM_RELEASE_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateArgs(name, args);

    const chartClass: ChartClass = args.chartClass ?? "default";
    const releaseName = args.releaseName ?? name;
    const waitTimeoutMs = args.waitTimeoutMs ?? DEFAULT_TIMEOUT_MS_BY_CLASS[chartClass];

    assertVersionTested(args.chart, args.version);

    const baseValues = (args.values as Record<string, unknown> | undefined) ?? {};
    const values: Record<string, unknown> = { ...baseValues };
    if (args.daemonSet === true && args.excludeFargate !== false) {
      values.affinity = FARGATE_EXCLUSION_AFFINITY;
    }

    const parent = { parent: this } as const;

    this.release = new k8s.helm.v3.Release(
      `${name}-release`,
      {
        chart: args.chart,
        version: args.version,
        name: releaseName,
        namespace: args.namespace,
        repositoryOpts: { repo: args.repository },
        values,
        skipAwait: false,
        timeout: Math.ceil(waitTimeoutMs / 1000),
      },
      parent,
    );

    this.releaseName = this.release.name;
    this.namespace = this.release.namespace;
    this.status = this.release.status;
    this.chartVersion = pulumi.output(args.version);

    this.registerOutputs({
      releaseName: this.releaseName,
      namespace: this.namespace,
      status: this.status,
      chartVersion: this.chartVersion,
    });
  }
}
