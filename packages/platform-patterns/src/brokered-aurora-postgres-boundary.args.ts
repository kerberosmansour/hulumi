import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export type BrokeredPostgresIdentityKind = "runtime" | "broker" | "migrator" | "rotation";
export type BrokeredPostgresRolloutPhase =
  | "infrastructure"
  | "migrator"
  | "broker"
  | "runtime"
  | "rotation";

export interface BrokeredPostgresIdentityArgs {
  /** Exact Kubernetes ServiceAccount name. Wildcards are rejected. */
  readonly serviceAccountName: string;
  /** Exact IAM role name. Wildcards are rejected. */
  readonly roleName: string;
}

export interface BrokeredPostgresDatabaseArgs {
  /** Aurora writer/cluster endpoint. This is connection metadata, never a credential. */
  readonly endpoint: pulumi.Input<string>;
  /** PostgreSQL listener port. Defaults are deliberately not inferred. */
  readonly port: number;
  /** Existing Aurora or RDS Proxy security group receiving only brokered paths. */
  readonly securityGroupId: pulumi.Input<string>;
  /**
   * Exact private CIDRs used by Kubernetes NetworkPolicy for database egress.
   * AWS security-group enforcement is separately bound to securityGroupId.
   */
  readonly cidrs: readonly string[];
}

export interface BrokeredPostgresCapabilityArgs {
  readonly issuer: string;
  readonly audience: string;
  /**
   * Public asymmetric signing keys as a JWKS document. Private/symmetric key
   * material is rejected and no network fetch path is created.
   */
  readonly jwksJson: string;
  /** Maximum accepted capability lifetime. Must be 1–300 seconds. */
  readonly maxTtlSeconds: number;
}

export interface BrokeredPostgresWorkloadArgs {
  /** Immutable OCI reference ending in @sha256:<64 hex>. */
  readonly image: string;
  readonly command: readonly string[];
  readonly args?: readonly string[];
}

export interface BrokeredPostgresServingWorkloadArgs extends BrokeredPostgresWorkloadArgs {
  readonly port: number;
}

export interface BrokeredPostgresRotationWorkloadArgs extends BrokeredPostgresWorkloadArgs {
  /** Exact Kubernetes CronJob schedule. */
  readonly schedule: string;
}

export interface BrokeredPostgresRolloutArgs {
  /**
   * Requested external handoff phase. This component never uses the phase to
   * activate workloads; every executable child remains inert.
   */
  readonly phase: BrokeredPostgresRolloutPhase;
  /**
   * Content-addressed external evidence bundle. Required for every requested
   * phase after infrastructure, but deliberately not treated as activation
   * authority by this IaC-only component.
   */
  readonly evidence?: {
    readonly immutableRef: string;
    readonly sha256: string;
  };
}

export interface BrokeredPostgresPlacementProfileArgs {
  /** Exact reviewed RuntimeClass for this trust class. */
  readonly runtimeClassName: string;
  /**
   * Exact NodeRestriction-protected node-pool label. Runtime and privileged
   * profiles must use the same key and different values.
   */
  readonly nodePool: {
    readonly key: string;
    readonly value: string;
  };
  /** Exact taint tolerated only by this trust class. */
  readonly toleration: {
    readonly key: string;
    readonly value: string;
    readonly effect: "NoSchedule";
  };
  /** Exact reviewed scheduler. */
  readonly schedulerName: string;
  /** Exact reviewed priority class. */
  readonly priorityClassName: string;
}

export interface BrokeredPostgresPlacementArgs {
  readonly runtime: BrokeredPostgresPlacementProfileArgs;
  /** Shared only by broker, migrator, and rotation; disjoint from runtime. */
  readonly privileged: BrokeredPostgresPlacementProfileArgs;
}

export interface BrokeredPostgresRuntimeIngressArgs {
  /** Caller-selected ClusterIP Service name; no default public ingress is created. */
  readonly serviceName: string;
  /** Exact namespace permitted by the runtime NetworkPolicy ingress. */
  readonly callerNamespace: string;
  /** Non-empty exact caller Pod selector. Wildcards are rejected. */
  readonly callerPodSelector: Readonly<Record<string, string>>;
  /** Existing caller workload security group permitted to reach the runtime port. */
  readonly callerSecurityGroupId: pulumi.Input<string>;
}

export interface BrokeredAuroraPostgresBoundaryArgs {
  readonly tier: Tier;
  /** Exact AWS region used to bind Secrets Manager KMS decryption. */
  readonly awsRegion: string;
  readonly namespace: string;
  /** Exact EKS OIDC provider ARN for IRSA. */
  readonly oidcProviderArn: string;
  /** Exact HTTPS EKS OIDC issuer URL. */
  readonly oidcIssuer: string;
  readonly oidcAudience?: string;
  readonly permissionBoundaryArn?: pulumi.Input<string>;

  readonly vpcId: pulumi.Input<string>;
  readonly database: BrokeredPostgresDatabaseArgs;
  /** Exact Route 53 Resolver IPv4 /32s; runtime receives only DNS plus broker egress. */
  readonly dnsResolverCidrs: readonly string[];
  /** Exact private CIDRs for the Secrets Manager and KMS interface endpoints. */
  readonly endpointCidrs: readonly string[];
  /** Existing interface-endpoint SGs. No identity receives general internet egress. */
  readonly endpointSecurityGroupIds: {
    readonly secretsManager: pulumi.Input<string>;
    readonly kms: pulumi.Input<string>;
    /** Existing DynamoDB interface endpoint SG used by replay protection. */
    readonly dynamodb: pulumi.Input<string>;
  };
  /** Exact DynamoDB interface endpoint id used to scope replay-table IAM. */
  readonly dynamodbVpcEndpointId: string;
  /**
   * Exact private DNS URL of the DynamoDB interface endpoint. The broker is
   * configured to use this URL instead of the public regional endpoint.
   */
  readonly dynamodbEndpointUrl: string;

  readonly kmsKeyArn: pulumi.Input<string>;
  /** Existing master secret; only the migrator and rotation identities may read it. */
  readonly masterSecretArn: pulumi.Input<string>;
  /** Two value-free SecureSecret containers for alternating broker logins. */
  readonly applicationSecretNames: readonly [string, string];

  readonly capability: BrokeredPostgresCapabilityArgs;
  /** Exact disjoint runtime versus broker/migrator/rotation placement. */
  readonly placement: BrokeredPostgresPlacementArgs;
  /**
   * Fail-closed external handoff metadata. The component itself keeps every
   * executable workload inert in every requested phase.
   */
  readonly rollout?: BrokeredPostgresRolloutArgs;
  /**
   * Required before runtime serving can be activated. No wildcard or broad
   * ingress form is accepted.
   */
  readonly runtimeIngress?: BrokeredPostgresRuntimeIngressArgs;
  readonly identities: Record<BrokeredPostgresIdentityKind, BrokeredPostgresIdentityArgs>;
  readonly workloads: {
    readonly runtime: BrokeredPostgresServingWorkloadArgs;
    readonly broker: BrokeredPostgresServingWorkloadArgs;
    readonly migrator: BrokeredPostgresWorkloadArgs;
    readonly rotation: BrokeredPostgresRotationWorkloadArgs;
  };
  readonly tags?: Record<string, string>;
}
