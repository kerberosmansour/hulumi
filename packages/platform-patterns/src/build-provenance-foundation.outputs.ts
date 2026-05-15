import type * as pulumi from "@pulumi/pulumi";

export interface BuildProvenanceFoundationOutputs {
  readonly requiredPermissions: pulumi.Output<Record<string, string>>;
  readonly reusableWorkflowSnippet: pulumi.Output<string>;
  readonly caveats: pulumi.Output<string[]>;
}
