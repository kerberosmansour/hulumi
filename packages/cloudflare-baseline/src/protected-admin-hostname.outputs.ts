import type * as pulumi from "@pulumi/pulumi";

export interface ProtectedAdminHostnameOutputs {
  readonly hostname: pulumi.Output<string>;
  readonly applicationId: pulumi.Output<string>;
  readonly policyId: pulumi.Output<string | undefined>;
  readonly appliedControls: pulumi.Output<string[]>;
  readonly requiredIdentitySelectors: pulumi.Output<string[]>;
}
