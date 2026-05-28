import type * as pulumi from "@pulumi/pulumi";

import type { SecureSecretRotationPosture } from "./secure-aws-primitives.args";

export interface SecureIamDeploymentRoleOutputs {
  readonly roleArn: pulumi.Output<string>;
  readonly roleName: pulumi.Output<string>;
  readonly trustPolicySummary: pulumi.Output<Record<string, string>>;
}

export interface SecureWorkloadRoleOutputs {
  readonly roleArn: pulumi.Output<string>;
  readonly roleName: pulumi.Output<string>;
}

export interface SecureSecretOutputs {
  readonly secretArn: pulumi.Output<string>;
  readonly rotationPosture: pulumi.Output<SecureSecretRotationPosture>;
}

export interface SecureLaunchTemplateOutputs {
  readonly launchTemplateId: pulumi.Output<string>;
  readonly launchTemplateArn: pulumi.Output<string>;
}
