import type * as pulumi from "@pulumi/pulumi";

export interface BotProtectionBaselineOutputs {
  readonly botManagementId: pulumi.Output<string | undefined>;
  readonly appliedControls: pulumi.Output<string[]>;
  readonly unsupportedControls: pulumi.Output<string[]>;
  readonly degradedControls: pulumi.Output<string[]>;
}
