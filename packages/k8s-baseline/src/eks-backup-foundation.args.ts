import type * as pulumi from "@pulumi/pulumi";

/** Bound on `BackupPlan.rules`. */
export const MAX_BACKUP_LIFECYCLE_RULES = 8;
/** Bound on `BackupSelection.resources`. */
export const MAX_BACKUP_SELECTIONS = 32;

export interface EksBackupLifecycleRule {
  /** Rule name. Required. */
  ruleName: string;
  /** Cron schedule expression for the backup window. */
  schedule: string;
  /** Days to keep recovery points. Must be > 0 (M5 invariant). */
  retentionDays: number;
  /**
   * Optional cold-storage transition (in days). Must be < retentionDays - 90 if set
   * (AWS Backup hard limit).
   */
  coldStorageAfterDays?: number;
  /** Optional `EnableContinuousBackup`. Default `false`. */
  enableContinuousBackup?: boolean;
}

export interface EksBackupFoundationArgs {
  /** Cluster identifier (used in resource names + tags). */
  clusterIdentifier: pulumi.Input<string>;
  /** KMS key ARN for vault encryption. M5 contract: required (no default to AWS-managed). */
  kmsKeyArn: pulumi.Input<string>;
  /** IAM role ARN that AWS Backup assumes. */
  iamRoleArn: pulumi.Input<string>;
  /** Backup lifecycle rules. Bounded at {@link MAX_BACKUP_LIFECYCLE_RULES}. */
  rules: EksBackupLifecycleRule[];
  /**
   * Resource ARNs to back up (typically EFS / EBS for stateful workloads,
   * RDS / Aurora for managed databases). Bounded at {@link MAX_BACKUP_SELECTIONS}.
   */
  resourceArns: pulumi.Input<string>[];
  /**
   * Default `false`. When `true`, the vault is created with vault lock
   * + air-gapped (immutable) configuration. M5 contract: emits an output
   * marking the manual confirmation step required before vault lock
   * actually finalizes (AWS irreversible action).
   */
  enableImmutableVaultLock?: boolean;
  /**
   * Vault lock minimum retention days. Required when `enableImmutableVaultLock` is `true`.
   */
  vaultLockMinRetentionDays?: number;
  tags?: Record<string, string>;
}
