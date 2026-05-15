import type * as pulumi from "@pulumi/pulumi";

export interface DeploymentRepositoryFoundationOutputs {
  readonly repoFullName: pulumi.Output<string>;
  readonly environmentNames: pulumi.Output<string[]>;
  readonly secretReferences: pulumi.Output<Record<string, string[]>>;
  readonly provenanceEnabled: pulumi.Output<boolean>;
}
