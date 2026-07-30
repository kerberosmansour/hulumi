import type * as pulumi from "@pulumi/pulumi";

import type { WorkloadCapabilityIssuerBoundaryArgs } from "./workload-capability-issuer-boundary.args";

export interface WorkloadCapabilityIssuerIdentityReceipt {
  readonly boundary: string;
  readonly namespace: string;
  readonly serviceAccountName: string;
  readonly roleArn: string;
  readonly securityGroupId: string;
  readonly serviceName: string;
  readonly authorityTableName: string;
  readonly capability: {
    readonly issuer: string;
    readonly audience: string;
    readonly maxTtlSeconds: number;
  };
  readonly limits: readonly string[];
}

export interface WorkloadCapabilityIssuerBoundaryOutputs {
  /**
   * Deeply resolved value-free security contract consumed by stack policies.
   * Pulumi secret markings propagate if a caller marks any input.
   */
  readonly policyContract: pulumi.Output<pulumi.Unwrap<WorkloadCapabilityIssuerBoundaryArgs>>;
  readonly roleArn: pulumi.Output<string>;
  readonly serviceAccountName: pulumi.Output<string>;
  readonly securityGroupId: pulumi.Output<string>;
  readonly serviceName: pulumi.Output<string>;
  readonly identityReceipt: pulumi.Output<WorkloadCapabilityIssuerIdentityReceipt>;
}
