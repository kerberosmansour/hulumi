import type * as pulumi from "@pulumi/pulumi";

export interface IstioFoundationOutputs {
  istiodReleaseName: pulumi.Output<string>;
  cniReleaseName: pulumi.Output<string | undefined>;
  ingressGatewayReleaseName: pulumi.Output<string | undefined>;
  /** Computed from the chart's standard SA name in the chosen namespace. Load-bearing for M3's AlbMeshedHttpEntrypoint. */
  ingressGatewayServiceAccountName: pulumi.Output<string | undefined>;
  /** Namespace the ingress gateway lives in (load-bearing for M3 cross-ns Gateway ref). */
  ingressGatewayNamespace: pulumi.Output<string | undefined>;
  /** Echo of the input version. */
  version: pulumi.Output<string>;
}
