import type * as pulumi from "@pulumi/pulumi";

export interface NamespaceFoundationOutputs {
  namespaceName: pulumi.Output<string>;
  defaultServiceAccountName: pulumi.Output<string>;
  /** Names of the NetworkPolicy resources emitted (default-deny, dns-egress, imds-deny, mesh-egress). */
  networkPolicyNames: pulumi.Output<string[]>;
  /** Whether the default ServiceAccount has `automountServiceAccountToken: false`. */
  defaultServiceAccountAutomountDisabled: pulumi.Output<boolean>;
}
