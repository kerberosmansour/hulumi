import type * as pulumi from "@pulumi/pulumi";

export interface AccountFoundationOutputs {
  cloudTrailArn: pulumi.Output<string>;
  configRecorderArn: pulumi.Output<string>;
  guardDutyDetectorId: pulumi.Output<string>;
  securityHubHubArn: pulumi.Output<string>;
  kmsKeyArns: pulumi.Output<Record<string, string>>;
  iamBaselinePolicyArns: pulumi.Output<string[]>;
}
