import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

import { HardenedHelmRelease } from "./hardened-helm-release";
import type {
  IstioFoundationArgs,
  IstioIngressGatewayArgs,
  PodSecurityLevel,
} from "./istio-foundation.args";
import type { IstioFoundationOutputs } from "./istio-foundation.outputs";

export const ISTIO_FOUNDATION_COMPONENT_TYPE = "hulumi:k8s:IstioFoundation";

const ISTIO_HELM_REPO = "https://istio-release.storage.googleapis.com/charts";

const VALID_MTLS = new Set(["STRICT", "PERMISSIVE"]);
const VALID_PSA: ReadonlySet<PodSecurityLevel> = new Set([
  "baseline",
  "restricted",
  "privileged",
]);

const DEFAULT_INGRESS_GATEWAY: Required<IstioIngressGatewayArgs> = {
  enabled: true,
  serviceType: "ClusterIP",
};

function validateArgs(args: IstioFoundationArgs): void {
  if (
    args.version === undefined ||
    typeof args.version !== "string" ||
    args.version.trim() === ""
  ) {
    throw new Error('IstioFoundation: version is required (no "latest")');
  }
  if (args.defaultMTLS !== undefined && !VALID_MTLS.has(args.defaultMTLS)) {
    throw new Error(
      `IstioFoundation: defaultMTLS must be one of STRICT, PERMISSIVE (got "${String(args.defaultMTLS)}")`,
    );
  }
  for (const [field, value] of [
    ["istiodNamespace", args.istiodNamespace],
    ["cniNamespace", args.cniNamespace],
  ] as const) {
    if (value !== undefined && (typeof value !== "string" || value.trim() === "")) {
      throw new Error(`IstioFoundation: ${field} must be non-empty when supplied`);
    }
  }
  if (args.podSecurity !== undefined && !VALID_PSA.has(args.podSecurity)) {
    throw new Error(
      `IstioFoundation: podSecurity must be one of baseline, restricted, privileged (got "${String(args.podSecurity)}")`,
    );
  }
}

function makeNamespace(
  name: string,
  namespaceName: pulumi.Input<string>,
  podSecurity: PodSecurityLevel,
  parent: pulumi.ComponentResource,
): k8s.core.v1.Namespace {
  return new k8s.core.v1.Namespace(
    name,
    {
      metadata: {
        name: namespaceName,
        labels: {
          "pod-security.kubernetes.io/enforce": podSecurity,
          "pod-security.kubernetes.io/enforce-version": "latest",
          "hulumi.dev/managed-by": "IstioFoundation",
        },
      },
    },
    { parent },
  );
}

export class IstioFoundation extends pulumi.ComponentResource implements IstioFoundationOutputs {
  public readonly istiodReleaseName: pulumi.Output<string>;
  public readonly cniReleaseName: pulumi.Output<string | undefined>;
  public readonly ingressGatewayReleaseName: pulumi.Output<string | undefined>;
  public readonly ingressGatewayServiceAccountName: pulumi.Output<string | undefined>;
  public readonly ingressGatewayNamespace: pulumi.Output<string | undefined>;
  public readonly version: pulumi.Output<string>;

  constructor(name: string, args: IstioFoundationArgs, opts?: pulumi.ComponentResourceOptions) {
    super(ISTIO_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    validateArgs(args);

    const istiodNs = args.istiodNamespace ?? "istio-system";
    const cniNs = args.cniNamespace ?? "kube-system";
    const ingressNs = args.ingressNamespace ?? "istio-ingress";
    const cniEnabled = args.cniEnabled !== false;
    const excludeFargate = args.excludeFargate !== false;
    const defaultMTLS = args.defaultMTLS ?? "STRICT";
    const podSecurity: PodSecurityLevel = args.podSecurity ?? "baseline";
    const ingressGateway: Required<IstioIngressGatewayArgs> = {
      enabled: args.ingressGateway?.enabled ?? DEFAULT_INGRESS_GATEWAY.enabled,
      serviceType: args.ingressGateway?.serviceType ?? DEFAULT_INGRESS_GATEWAY.serviceType,
    };

    if (!cniEnabled) {
      pulumi.log.warn(
        `IstioFoundation "${name}": cniEnabled: false — istio-cni will NOT be installed. Sidecar pods will continue to render the istio-init initContainer requiring NET_ADMIN+NET_RAW capabilities; namespaces under PSA baseline will reject those pods. See docs/cookbooks/psa-baseline-istio-sidecar.md for the security posture this disables.`,
      );
    }
    if (defaultMTLS === "PERMISSIVE") {
      pulumi.log.warn(
        `IstioFoundation "${name}": defaultMTLS: PERMISSIVE — workloads can be reached over plaintext mTLS-disabled paths. The mesh's trust posture is degraded relative to the STRICT default; consider whether this is intentional.`,
      );
    }

    const parent = { parent: this } as const;

    // Namespaces with PSA-baseline (or override).
    makeNamespace(`${name}-istiod-ns`, istiodNs, podSecurity, this);
    if (ingressGateway.enabled) {
      makeNamespace(`${name}-ingress-ns`, ingressNs, podSecurity, this);
    }
    // cniNs (kube-system) is owned by the cluster; don't create.

    // 1. CNI (first in dependsOn chain).
    let cniRelease: HardenedHelmRelease | undefined;
    if (cniEnabled) {
      cniRelease = new HardenedHelmRelease(
        `${name}-cni`,
        {
          chart: "cni",
          version: args.version,
          namespace: cniNs,
          repository: ISTIO_HELM_REPO,
          chartClass: "istio",
          daemonSet: true,
          excludeFargate,
          values: {
            cni: { cniBinDir: "/opt/cni/bin", cniConfDir: "/etc/cni/net.d" },
          },
        },
        parent,
      );
    }

    // 2. istiod (depends on cni).
    const istiodRelease = new HardenedHelmRelease(
      `${name}-istiod`,
      {
        chart: "istiod",
        version: args.version,
        namespace: istiodNs,
        repository: ISTIO_HELM_REPO,
        chartClass: "istio",
        values: cniEnabled ? { pilot: { cni: { enabled: true } } } : {},
      },
      { parent: this, dependsOn: cniRelease ? [cniRelease] : [] },
    );

    // 3. ingressgateway (depends on istiod).
    let ingressRelease: HardenedHelmRelease | undefined;
    let ingressGwSaName: pulumi.Output<string | undefined> = pulumi.output(undefined);
    let ingressGwNamespaceOut: pulumi.Output<string | undefined> = pulumi.output(undefined);
    if (ingressGateway.enabled) {
      ingressRelease = new HardenedHelmRelease(
        `${name}-ingress`,
        {
          chart: "gateway",
          version: args.version,
          namespace: ingressNs,
          repository: ISTIO_HELM_REPO,
          chartClass: "istio",
          values: { service: { type: ingressGateway.serviceType } },
        },
        { parent: this, dependsOn: [istiodRelease] },
      );
      // The istio gateway chart's default release-name is the SA name; we
      // set releaseName implicitly via instance-name (M1 default), so SA
      // name === instance name.
      ingressGwSaName = pulumi.output(`${name}-ingress`);
      ingressGwNamespaceOut = pulumi.output(ingressNs);
    }

    // Cluster-wide PeerAuthentication for default mTLS.
    new k8s.apiextensions.CustomResource(
      `${name}-mesh-mtls`,
      {
        apiVersion: "security.istio.io/v1beta1",
        kind: "PeerAuthentication",
        metadata: { name: "default", namespace: istiodNs },
        spec: { mtls: { mode: defaultMTLS } },
      },
      { parent: this, dependsOn: [istiodRelease] },
    );

    this.istiodReleaseName = istiodRelease.releaseName;
    this.cniReleaseName = cniRelease ? cniRelease.releaseName : pulumi.output(undefined);
    this.ingressGatewayReleaseName = ingressRelease
      ? ingressRelease.releaseName
      : pulumi.output(undefined);
    this.ingressGatewayServiceAccountName = ingressGwSaName;
    this.ingressGatewayNamespace = ingressGwNamespaceOut;
    this.version = pulumi.output(args.version);

    this.registerOutputs({
      istiodReleaseName: this.istiodReleaseName,
      cniReleaseName: this.cniReleaseName,
      ingressGatewayReleaseName: this.ingressGatewayReleaseName,
      ingressGatewayServiceAccountName: this.ingressGatewayServiceAccountName,
      ingressGatewayNamespace: this.ingressGatewayNamespace,
      version: this.version,
    });
  }
}
