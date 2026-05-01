import type * as pulumi from "@pulumi/pulumi";

/**
 * Behavior when the underlying SM fetch / parse / non-object / depth check
 * fails. `"fail"` (default) makes the rendered K8s Secret apply fail; the
 * Pulumi engine refuses to deploy. `"warn-empty"` preserves the legacy
 * behavior of logging the failure and emitting an empty Secret payload —
 * surface for the rare case where a partial/empty secret is a valid
 * degraded-mode artifact (e.g. a bootstrap stack that intentionally has
 * no SM secret yet). Choose `"warn-empty"` only with a written rationale.
 */
export type SecretFailureMode = "fail" | "warn-empty";

/**
 * Behavior when a key the consumer asked to extract is missing from the SM
 * JSON object. `"fail"` (default) makes the apply fail so a misconfigured
 * rotation or a renamed field in the upstream secret cannot silently ship
 * a Secret missing the key consumers depend on. `"warn"` preserves the
 * legacy log-and-skip behavior — surface for cases where a missing key
 * is genuinely tolerable (e.g. an optional API token).
 */
export type MissingKeyMode = "fail" | "warn";

/** Hard cap on `keyMapping` size. The bound exists to refuse unbounded growth. */
export const MAX_KEY_MAPPING_ENTRIES = 64;

export interface KubernetesSecretFromAwsSecretsManagerArgs {
  /** AWS Secrets Manager ARN of the source JSON secret. */
  secretsManagerArn: pulumi.Input<string>;
  /**
   * SM-JSON-key → K8s-Secret-data-key mapping. Refused if empty (silent
   * zero-key extraction is the failure mode this component exists to prevent).
   * Refused if it has more than {@link MAX_KEY_MAPPING_ENTRIES} entries.
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
  /**
   * Default `"fail"` (M2 fail-closed contract). See {@link SecretFailureMode}.
   */
  failureMode?: SecretFailureMode;
  /**
   * Default `"fail"` (M2 fail-closed contract). See {@link MissingKeyMode}.
   */
  missingKeyMode?: MissingKeyMode;
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
  /** See {@link SecretFailureMode}. */
  failureMode?: SecretFailureMode;
  /** See {@link MissingKeyMode}. */
  missingKeyMode?: MissingKeyMode;
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
