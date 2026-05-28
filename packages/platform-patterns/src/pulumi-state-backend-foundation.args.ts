import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export type PulumiStateBackendDrPosture =
  | "advisory-degraded"
  | "object-lock"
  | "replication"
  | "object-lock-and-replication";

export interface PulumiStateBackendReplicationArgs {
  readonly destinationBucketArn: pulumi.Input<string>;
  readonly roleArn: pulumi.Input<string>;
  readonly destinationKmsKeyArn?: pulumi.Input<string>;
}

export interface PulumiStateBackendObjectLockArgs {
  readonly mode?: "governance" | "compliance";
  readonly days?: number;
}

export interface PulumiStateBackendFoundationArgs {
  readonly tier: Tier;
  readonly bucketName: pulumi.Input<string>;
  readonly kmsAliasName: string;
  readonly enableLeaseTable?: boolean;
  readonly leaseTableName?: pulumi.Input<string>;
  readonly objectLock?: boolean | PulumiStateBackendObjectLockArgs;
  readonly replication?: PulumiStateBackendReplicationArgs;
  readonly forceDestroy?: pulumi.Input<boolean>;
  readonly tags?: pulumi.Input<Record<string, string>>;
}

export interface PulumiStateLeaseRecord {
  readonly stackKey: string;
  readonly holderId: string;
  readonly status: "active" | "released" | "expired";
}

export interface PulumiStateLeaseRequest {
  readonly stackKey: string;
  readonly holderId: string;
}

export interface PulumiStateLeaseResult {
  readonly status: "claimed" | "blocked";
  readonly reason?: string;
}

export interface StateBackendEvent {
  readonly eventName: string;
  readonly objectKey?: string;
  readonly actor?: string;
}

export interface StateBackendPostureSummary {
  readonly status: "clean" | "unsafe-degraded";
  readonly findings: readonly string[];
}

export interface PulumiOutputSummaryInput {
  readonly name: string;
  readonly value: unknown;
  readonly secret?: boolean;
}

export interface PulumiOutputSummary {
  readonly name: string;
  readonly secret: boolean;
  readonly valuePreview: string;
}
