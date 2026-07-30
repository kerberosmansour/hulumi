import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export interface WorkloadCapabilityIssuerIdentityArgs {
  /** Exact Kubernetes ServiceAccount name. Wildcards are rejected. */
  readonly serviceAccountName: string;
  /** Exact IAM role name. Wildcards are rejected. */
  readonly roleName: string;
}

export interface WorkloadCapabilityIssuerAuthorityTableArgs {
  /**
   * Existing exact DynamoDB authority-registry table ARN.
   * The runtime table name is derived from this ARN; callers cannot supply a
   * second, potentially inconsistent authority-table identity.
   */
  readonly arn: pulumi.Input<string>;
}

export interface WorkloadCapabilityIssuerTransportTlsArgs {
  /**
   * Existing Secrets Manager ARN containing the issuer's native TLS identity.
   * Only AWSCURRENT may be read; no secret value enters Pulumi or Kubernetes.
   */
  readonly identitySecretArn: pulumi.Input<string>;
  /** Exact KMS key encrypting the TLS identity secret. */
  readonly kmsKeyArn: pulumi.Input<string>;
}

export interface WorkloadCapabilityIssuerCapabilityArgs {
  /** Exact issuer claim placed in minted capabilities. */
  readonly issuer: string;
  /** Exact audience claim placed in minted capabilities. */
  readonly audience: string;
  /** Maximum capability lifetime. Must be 1–60 seconds. */
  readonly maxTtlSeconds: number;
}

export interface WorkloadCapabilityIssuerWorkloadIdentityArgs {
  /** Exact issuer expected on projected workload JWTs. */
  readonly issuer: string;
  /** Exact audience expected on projected workload JWTs. */
  readonly audience: string;
  /**
   * Static public RSA/RS256 JWKS used to verify projected workload JWTs.
   * No network JWKS retrieval path is created.
   */
  readonly jwksJson: string;
}

export interface WorkloadCapabilityIssuerCallerArgs {
  /** Exact namespace allowed to call the issuer Service. */
  readonly namespace: string;
  /** Non-empty exact Pod selector allowed to call the issuer Service. */
  readonly podSelector: Readonly<Record<string, string>>;
  /** Existing caller workload security group allowed to reach the issuer. */
  readonly securityGroupId: pulumi.Input<string>;
}

export interface WorkloadCapabilityIssuerWorkloadArgs {
  /** Immutable OCI reference ending in @sha256:<64 lowercase hex>. */
  readonly image: string;
  /** Exact executable argv. */
  readonly command: readonly string[];
  /** Optional exact arguments. */
  readonly args?: readonly string[];
  /** Native TLS listener port. */
  readonly port: number;
}

export interface WorkloadCapabilityIssuerPlacementArgs {
  /** Exact reviewed RuntimeClass for the issuer trust class. */
  readonly runtimeClassName: string;
  /** Exact NodeRestriction-protected node-pool label. */
  readonly nodePool: {
    readonly key: string;
    readonly value: string;
  };
  /** Exact taint tolerated only by the issuer trust class. */
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

export interface WorkloadCapabilityIssuerBoundaryArgs {
  readonly tier: Tier;
  readonly awsRegion: string;
  readonly namespace: string;
  /** Exact EKS OIDC provider ARN for IRSA. */
  readonly oidcProviderArn: string;
  /** Exact HTTPS EKS OIDC issuer URL. */
  readonly oidcIssuer: string;
  readonly oidcAudience?: string;
  readonly permissionBoundaryArn?: pulumi.Input<string>;

  readonly vpcId: pulumi.Input<string>;
  /** Exact Route 53 Resolver IPv4 /32s. */
  readonly dnsResolverCidrs: readonly string[];
  /** Exact private CIDRs containing the declared interface endpoints. */
  readonly endpointCidrs: readonly string[];
  readonly endpointSecurityGroupIds: {
    /** Existing regional STS interface endpoint required for IRSA credential exchange. */
    readonly sts: pulumi.Input<string>;
    readonly kms: pulumi.Input<string>;
    readonly dynamodb: pulumi.Input<string>;
    readonly secretsManager: pulumi.Input<string>;
  };
  /** Exact DynamoDB interface endpoint id used to scope authority-table IAM. */
  readonly dynamodbVpcEndpointId: string;
  /** Exact private DNS URL of the DynamoDB interface endpoint. */
  readonly dynamodbEndpointUrl: string;

  /** Exact asymmetric KMS signing key; only Sign and GetPublicKey are granted. */
  readonly signingKeyArn: pulumi.Input<string>;
  readonly authorityTable: WorkloadCapabilityIssuerAuthorityTableArgs;
  readonly transportTls: WorkloadCapabilityIssuerTransportTlsArgs;
  readonly capability: WorkloadCapabilityIssuerCapabilityArgs;
  readonly workloadIdentity: WorkloadCapabilityIssuerWorkloadIdentityArgs;
  readonly identity: WorkloadCapabilityIssuerIdentityArgs;
  readonly caller: WorkloadCapabilityIssuerCallerArgs;
  readonly serviceName: string;
  /** Bounded dependency deadline passed to the issuer process. */
  readonly dependencyDeadlineMs: number;
  readonly workload: WorkloadCapabilityIssuerWorkloadArgs;
  readonly placement: WorkloadCapabilityIssuerPlacementArgs;
  readonly tags?: Record<string, string>;
}
