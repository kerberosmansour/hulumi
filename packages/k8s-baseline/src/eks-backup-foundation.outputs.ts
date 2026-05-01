import type * as pulumi from "@pulumi/pulumi";

export interface EksBackupFoundationOutputs {
  vaultArn: pulumi.Output<string>;
  planArn: pulumi.Output<string>;
  selectionArn: pulumi.Output<string>;
  immutableVaultLockManualStepRequired: pulumi.Output<boolean>;
}
