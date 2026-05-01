import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type {
  EksComputeMode,
  EksRuntimeDetectionFoundationArgs,
} from "./eks-runtime-detection-foundation.args";
import { MAX_RUNTIME_ALARM_RULES } from "./eks-runtime-detection-foundation.args";
import type { EksRuntimeDetectionFoundationOutputs } from "./eks-runtime-detection-foundation.outputs";

export const EKS_RUNTIME_DETECTION_FOUNDATION_COMPONENT_TYPE =
  "hulumi:k8s:EksRuntimeDetectionFoundation";

const VALID_COMPUTE_MODES: ReadonlySet<EksComputeMode> = new Set([
  "ec2-managed",
  "fargate-only",
  "mixed",
]);

export class EksRuntimeDetectionFoundation
  extends pulumi.ComponentResource
  implements EksRuntimeDetectionFoundationOutputs
{
  public readonly guardDutyFeaturesEnabled: pulumi.Output<string[]>;
  public readonly alarmArns: pulumi.Output<string[]>;
  public readonly runtimeMonitoringUnsupported: pulumi.Output<boolean>;

  constructor(
    name: string,
    args: EksRuntimeDetectionFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(EKS_RUNTIME_DETECTION_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    const compute: EksComputeMode = args.clusterCompute ?? "ec2-managed";
    if (!VALID_COMPUTE_MODES.has(compute)) {
      throw new Error(
        `EksRuntimeDetectionFoundation: clusterCompute must be one of "ec2-managed" | "fargate-only" | "mixed" (got "${String(compute)}")`,
      );
    }

    const enableAudit = args.enableEksAuditLogs !== false;
    const enableRuntime = (args.enableRuntimeMonitoring ?? true) && compute !== "fargate-only";
    const runtimeUnsupported = compute === "fargate-only";
    if (runtimeUnsupported && args.enableRuntimeMonitoring === true) {
      pulumi.log.warn(
        `EksRuntimeDetectionFoundation "${name}": clusterCompute is "fargate-only" — GuardDuty Runtime Monitoring is unsupported on EKS-on-Fargate. The component will not enable EKS_RUNTIME_MONITORING; consider sidecar instrumentation.`,
      );
    }

    const enableSecretAlarm = args.enableSecretReadAlarm !== false;
    const enableExecAlarm = args.enablePodExecAlarm !== false;

    const parent = { parent: this } as const;
    const features: string[] = [];
    const alarmArns: pulumi.Output<string>[] = [];

    if (enableAudit) {
      new aws.guardduty.DetectorFeature(
        `${name}-eks-audit`,
        {
          detectorId: args.guardDutyDetectorId,
          name: "EKS_AUDIT_LOGS",
          status: "ENABLED",
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        },
        parent,
      );
      features.push("EKS_AUDIT_LOGS");
    }

    if (enableRuntime) {
      new aws.guardduty.DetectorFeature(
        `${name}-eks-runtime`,
        {
          detectorId: args.guardDutyDetectorId,
          name: "EKS_RUNTIME_MONITORING",
          status: "ENABLED",
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        },
        parent,
      );
      features.push("EKS_RUNTIME_MONITORING");
    }

    let alarmRuleCount = 0;
    function nextAlarmIdx(): number {
      alarmRuleCount += 1;
      if (alarmRuleCount > MAX_RUNTIME_ALARM_RULES) {
        throw new Error(
          `EksRuntimeDetectionFoundation: emitted alarm count would exceed bound ${MAX_RUNTIME_ALARM_RULES} (component "${name}")`,
        );
      }
      return alarmRuleCount;
    }

    if (enableSecretAlarm) {
      nextAlarmIdx();
      const filterName = `${name}-secret-read`;
      new aws.cloudwatch.LogMetricFilter(
        filterName,
        {
          name: filterName,
          logGroupName: args.auditLogGroupName,
          // Match audit events whose `objectRef.resource` is `secrets` and `verb` is `get|list|watch`.
          pattern:
            '{ ($.objectRef.resource = "secrets") && (($.verb = "get") || ($.verb = "list") || ($.verb = "watch")) }',
          metricTransformation: {
            namespace: "Hulumi/EksRuntimeDetection",
            name: `${name}-secret-read-count`,
            value: "1",
            defaultValue: "0",
          },
        },
        parent,
      );
      const alarm = new aws.cloudwatch.MetricAlarm(
        `${name}-secret-read-alarm`,
        {
          name: `${name}-secret-read`,
          comparisonOperator: "GreaterThanOrEqualToThreshold",
          evaluationPeriods: 1,
          metricName: `${name}-secret-read-count`,
          namespace: "Hulumi/EksRuntimeDetection",
          period: 300,
          statistic: "Sum",
          threshold: 1,
          alarmActions: [args.alarmSnsTopicArn],
          okActions: [args.alarmSnsTopicArn],
          treatMissingData: "notBreaching",
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        },
        parent,
      );
      alarmArns.push(alarm.arn);
    }

    if (enableExecAlarm) {
      nextAlarmIdx();
      const filterName = `${name}-pod-exec`;
      new aws.cloudwatch.LogMetricFilter(
        filterName,
        {
          name: filterName,
          logGroupName: args.auditLogGroupName,
          pattern:
            '{ ($.objectRef.resource = "pods") && ($.objectRef.subresource = "exec") }',
          metricTransformation: {
            namespace: "Hulumi/EksRuntimeDetection",
            name: `${name}-pod-exec-count`,
            value: "1",
            defaultValue: "0",
          },
        },
        parent,
      );
      const alarm = new aws.cloudwatch.MetricAlarm(
        `${name}-pod-exec-alarm`,
        {
          name: `${name}-pod-exec`,
          comparisonOperator: "GreaterThanOrEqualToThreshold",
          evaluationPeriods: 1,
          metricName: `${name}-pod-exec-count`,
          namespace: "Hulumi/EksRuntimeDetection",
          period: 300,
          statistic: "Sum",
          threshold: 1,
          alarmActions: [args.alarmSnsTopicArn],
          okActions: [args.alarmSnsTopicArn],
          treatMissingData: "notBreaching",
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        },
        parent,
      );
      alarmArns.push(alarm.arn);
    }

    this.guardDutyFeaturesEnabled = pulumi.output(features);
    this.alarmArns = pulumi.all(alarmArns).apply((arns) => arns);
    this.runtimeMonitoringUnsupported = pulumi.output(runtimeUnsupported);

    this.registerOutputs({
      guardDutyFeaturesEnabled: this.guardDutyFeaturesEnabled,
      alarmArns: this.alarmArns,
      runtimeMonitoringUnsupported: this.runtimeMonitoringUnsupported,
    });
  }
}
