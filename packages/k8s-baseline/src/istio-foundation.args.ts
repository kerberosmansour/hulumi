import type * as pulumi from "@pulumi/pulumi";

export type DefaultMTLSMode = "STRICT" | "PERMISSIVE";

export type PodSecurityLevel = "baseline" | "restricted" | "privileged";

export type IngressGatewayServiceType = "ClusterIP" | "LoadBalancer";

export interface IstioIngressGatewayArgs {
  enabled?: boolean;
  serviceType?: IngressGatewayServiceType;
}

export interface IstioFoundationArgs {
  /** Istio version applied uniformly to istiod, istio-cni, ingressgateway. */
  version: string;

  /** Defaults to `"istio-system"`. */
  istiodNamespace?: string;
  /** Defaults to `"kube-system"`. */
  cniNamespace?: string;
  /** Defaults to `"istio-ingress"`. */
  ingressNamespace?: pulumi.Input<string>;

  /** Default `true`. Flows through to the cni HardenedHelmRelease's daemonSet+excludeFargate args. */
  excludeFargate?: boolean;

  /** Default `"STRICT"`. Emits a cluster-wide PeerAuthentication. */
  defaultMTLS?: DefaultMTLSMode;

  /** Default `true`. Opt-out for legacy clusters where the CNI cannot be installed. */
  cniEnabled?: boolean;

  /** Default `{ enabled: true, serviceType: "ClusterIP" }`. */
  ingressGateway?: IstioIngressGatewayArgs;

  /** Default `"baseline"`. Applies to every namespace this component creates. */
  podSecurity?: PodSecurityLevel;
}
