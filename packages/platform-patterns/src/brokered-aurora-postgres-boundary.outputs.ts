import type * as pulumi from "@pulumi/pulumi";

import type {
  BrokeredAuroraPostgresBoundaryArgs,
  BrokeredPostgresIdentityKind,
} from "./brokered-aurora-postgres-boundary.args";

export type BrokeredPostgresRotationPosture = "infrastructure-only-unconfigured";

export interface BrokeredPostgresIdentityReceipt {
  readonly boundary: string;
  readonly namespace: string;
  readonly identities: Record<
    BrokeredPostgresIdentityKind,
    {
      readonly serviceAccountName: string;
      readonly roleArn: string;
      readonly securityGroupId: string;
    }
  >;
  readonly capability: {
    readonly issuer: string;
    readonly audience: string;
    readonly maxTtlSeconds: number;
  };
  readonly limits: readonly string[];
}

export interface BrokeredAuroraPostgresBoundaryOutputs {
  /**
   * Deeply resolved security-configuration contract consumed by CrossGuard
   * stack policies. Callers must not place credential values in this contract.
   * Pulumi secret markings propagate through this Output, while the registered
   * raw structure preserves per-leaf known/unknown and secret metadata.
   */
  readonly policyContract: pulumi.Output<pulumi.Unwrap<BrokeredAuroraPostgresBoundaryArgs>>;
  readonly roleArns: pulumi.Output<Record<BrokeredPostgresIdentityKind, string>>;
  readonly serviceAccountNames: pulumi.Output<Record<BrokeredPostgresIdentityKind, string>>;
  readonly securityGroupIds: pulumi.Output<Record<BrokeredPostgresIdentityKind, string>>;
  readonly applicationSecretArns: pulumi.Output<readonly [string, string]>;
  readonly replayTableArn: pulumi.Output<string>;
  readonly replayTableName: pulumi.Output<string>;
  readonly brokerServiceName: pulumi.Output<string>;
  readonly runtimeServiceName: pulumi.Output<string | undefined>;
  readonly rotationPosture: pulumi.Output<BrokeredPostgresRotationPosture>;
  readonly migrationOrdering: pulumi.Output<readonly string[]>;
  readonly identityReceipt: pulumi.Output<BrokeredPostgresIdentityReceipt>;
}
