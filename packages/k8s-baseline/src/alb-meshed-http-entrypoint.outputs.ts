import type * as pulumi from "@pulumi/pulumi";

export interface AlbMeshedHttpEntrypointOutputs {
  ingressName: pulumi.Output<string>;
  ingressNamespace: pulumi.Output<string>;
  gatewayName: pulumi.Output<string>;
  gatewayNamespace: pulumi.Output<string>;
  virtualServiceName: pulumi.Output<string>;
  virtualServiceNamespace: pulumi.Output<string>;
  authorizationPolicyName: pulumi.Output<string>;
  authorizationPolicyNamespace: pulumi.Output<string>;
  /** Computed from Ingress status — eventual; may be empty until ALB Controller provisions. */
  albAddress: pulumi.Output<string>;
}
