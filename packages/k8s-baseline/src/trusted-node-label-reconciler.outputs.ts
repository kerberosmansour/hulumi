import type { Output } from "@pulumi/pulumi";

export interface EksTrustedNodeLabelReconcilerOutputs {
  readonly roleArn: Output<string>;
  readonly serviceAccountName: Output<string>;
  readonly deploymentName: Output<string>;
  readonly admissionPolicyName: Output<string>;
  readonly alarmArns: Output<readonly string[]>;
  readonly metricNamespace: Output<string>;
}
