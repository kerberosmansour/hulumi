import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { EksBackupFoundationArgs } from "./eks-backup-foundation.args";
import { MAX_BACKUP_LIFECYCLE_RULES, MAX_BACKUP_SELECTIONS } from "./eks-backup-foundation.args";
import type { EksBackupFoundationOutputs } from "./eks-backup-foundation.outputs";

export const EKS_BACKUP_FOUNDATION_COMPONENT_TYPE = "hulumi:k8s:EksBackupFoundation";

const VAULT_LOCK_NOTE_ANNOTATION = "hulumi.dev/vault-lock-manual-step";

export class EksBackupFoundation
  extends pulumi.ComponentResource
  implements EksBackupFoundationOutputs
{
  public readonly vaultArn: pulumi.Output<string>;
  public readonly planArn: pulumi.Output<string>;
  public readonly selectionArn: pulumi.Output<string>;
  public readonly immutableVaultLockManualStepRequired: pulumi.Output<boolean>;

  constructor(name: string, args: EksBackupFoundationArgs, opts?: pulumi.ComponentResourceOptions) {
    super(EKS_BACKUP_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    if (args.rules === undefined || args.rules.length === 0) {
      throw new Error(`EksBackupFoundation: rules must be non-empty (component "${name}")`);
    }
    if (args.rules.length > MAX_BACKUP_LIFECYCLE_RULES) {
      throw new Error(
        `EksBackupFoundation: rules has ${args.rules.length} entries; max ${MAX_BACKUP_LIFECYCLE_RULES} (component "${name}")`,
      );
    }
    if (args.resourceArns === undefined || args.resourceArns.length === 0) {
      throw new Error(`EksBackupFoundation: resourceArns must be non-empty (component "${name}")`);
    }
    if (args.resourceArns.length > MAX_BACKUP_SELECTIONS) {
      throw new Error(
        `EksBackupFoundation: resourceArns has ${args.resourceArns.length} entries; max ${MAX_BACKUP_SELECTIONS} (component "${name}")`,
      );
    }
    for (const r of args.rules) {
      if (typeof r.retentionDays !== "number" || r.retentionDays <= 0) {
        throw new Error(
          `EksBackupFoundation: rule "${r.ruleName}" retentionDays must be > 0 (got ${r.retentionDays}) (component "${name}")`,
        );
      }
      if (r.coldStorageAfterDays !== undefined && r.coldStorageAfterDays > r.retentionDays - 90) {
        throw new Error(
          `EksBackupFoundation: rule "${r.ruleName}" coldStorageAfterDays (${r.coldStorageAfterDays}) must be at least 90 days less than retentionDays (${r.retentionDays}) (AWS Backup hard limit) (component "${name}")`,
        );
      }
    }
    if (args.enableImmutableVaultLock === true) {
      if (
        typeof args.vaultLockMinRetentionDays !== "number" ||
        args.vaultLockMinRetentionDays <= 0
      ) {
        throw new Error(
          `EksBackupFoundation: enableImmutableVaultLock: true requires vaultLockMinRetentionDays > 0 (component "${name}")`,
        );
      }
    }

    const parent = { parent: this } as const;
    const annotations: Record<string, string> = {};
    if (args.enableImmutableVaultLock === true) {
      annotations[VAULT_LOCK_NOTE_ANNOTATION] =
        "Vault lock is irreversible — finalize via the AWS console or `aws backup put-backup-vault-lock-configuration --change-detected-mode` only after operator confirmation.";
    }

    const vault = new aws.backup.Vault(
      `${name}-vault`,
      {
        name: `${name}-vault`,
        kmsKeyArn: args.kmsKeyArn,
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
      },
      parent,
    );

    if (args.enableImmutableVaultLock === true && args.vaultLockMinRetentionDays !== undefined) {
      new aws.backup.VaultLockConfiguration(
        `${name}-vault-lock`,
        {
          backupVaultName: vault.name,
          minRetentionDays: args.vaultLockMinRetentionDays,
          // changeableForDays: 3 → AWS Backup default, leaves the
          // operator a 72h window to back out before lock finalizes.
          changeableForDays: 3,
        },
        parent,
      );
    }

    const plan = new aws.backup.Plan(
      `${name}-plan`,
      {
        name: `${name}-plan`,
        rules: args.rules.map((r) => ({
          ruleName: r.ruleName,
          targetVaultName: vault.name,
          schedule: r.schedule,
          enableContinuousBackup: r.enableContinuousBackup ?? false,
          lifecycle: {
            deleteAfter: r.retentionDays,
            ...(r.coldStorageAfterDays !== undefined
              ? { coldStorageAfter: r.coldStorageAfterDays }
              : {}),
          },
        })),
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
      },
      parent,
    );

    const selection = new aws.backup.Selection(
      `${name}-selection`,
      {
        name: `${name}-selection`,
        planId: plan.id,
        iamRoleArn: args.iamRoleArn,
        resources: args.resourceArns,
      },
      parent,
    );

    this.vaultArn = vault.arn;
    this.planArn = plan.arn;
    this.selectionArn = pulumi
      .all([selection.id, plan.arn])
      .apply(([sid, _planArn]) => `arn:aws:backup:::backup-selection/${sid}`);
    this.immutableVaultLockManualStepRequired = pulumi.output(
      args.enableImmutableVaultLock === true,
    );

    this.registerOutputs({
      vaultArn: this.vaultArn,
      planArn: this.planArn,
      selectionArn: this.selectionArn,
      immutableVaultLockManualStepRequired: this.immutableVaultLockManualStepRequired,
      annotations,
    });
  }
}
