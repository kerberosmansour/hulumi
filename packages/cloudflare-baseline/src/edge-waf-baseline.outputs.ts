import type * as pulumi from "@pulumi/pulumi";

export interface EdgeWafBaselineOutputs {
  readonly rulesetIds: pulumi.Output<string[]>;
  readonly appliedControls: pulumi.Output<string[]>;
  readonly unsupportedControls: pulumi.Output<string[]>;
  readonly degradedControls: pulumi.Output<string[]>;
}
