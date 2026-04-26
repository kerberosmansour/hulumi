import type * as pulumi from "@pulumi/pulumi";

export interface KubernetesSecretFromAwsSecretsManagerArgs {
  /** AWS Secrets Manager ARN of the source JSON secret. */
  secretsManagerArn: pulumi.Input<string>;
  /**
   * SM-JSON-key → K8s-Secret-data-key mapping. Refused if empty (silent
   * zero-key extraction is the failure mode this component exists to prevent).
   */
  keyMapping: Record<string, string>;
  /** Target K8s namespace. */
  namespace: pulumi.Input<string>;
  /** K8s Secret name. Refused if empty, contains `/`, or contains `..`. */
  secretName: string;
  /** Optional AWS region override. Defaults to provider/process region. */
  region?: pulumi.Input<string>;
  /** Default `"Opaque"`. */
  secretType?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface RdsCredentialSecretArgs {
  /** SM ARN of the RDS auto-managed master credential. */
  rdsManagedMasterCredentialArn: pulumi.Input<string>;
  /** Target K8s namespace. */
  namespace: pulumi.Input<string>;
  /** K8s Secret name. */
  secretName: string;
  region?: pulumi.Input<string>;
  /**
   * Override the default key mapping. Defaults to extracting username,
   * password, host, port, engine, dbClusterIdentifier (the RDS-managed JSON
   * shape).
   */
  keyMapping?: Record<string, string>;
}

/** Default RDS auto-managed-master-credential extraction shape. Load-bearing for consumer apps. */
export const RDS_DEFAULT_KEY_MAPPING: Readonly<Record<string, string>> = Object.freeze({
  username: "username",
  password: "password",
  host: "host",
  port: "port",
  engine: "engine",
  dbClusterIdentifier: "dbClusterIdentifier",
});
