import type * as pulumi from "@pulumi/pulumi";

export interface Ec2PatchWavesOutputs {
  /** Names of the per-wave Ec2PatchBaselines emitted (in execution order). */
  waveNames: pulumi.Output<string[]>;
  /** ARN of the CloudWatch composite alarm gating wave-to-wave progression (only when multi-wave). */
  healthGateAlarmArn: pulumi.Output<string | undefined>;
}
