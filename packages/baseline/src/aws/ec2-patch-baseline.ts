import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type {
  ComplianceMetric,
  Ec2PatchBaselineArgs,
  RebootOption,
  StaggeringConfig,
} from "./ec2-patch-baseline.args";
import {
  MAX_COMPLIANCE_SEVERITIES,
  MAX_STAGGERING_BUCKETS,
  PATCH_GROUP_VALUES,
} from "./ec2-patch-baseline.args";
import type { Ec2PatchBaselineOutputs } from "./ec2-patch-baseline.outputs";
import { assertValidTier } from "./tier";

export const EC2_PATCH_BASELINE_COMPONENT_TYPE = "hulumi:baseline:aws:Ec2PatchBaseline";

const NO_REBOOT_COMMENT_TAG = "hulumi:no-reboot-comment";
const PATCH_GROUP_TAG = "Patch:Group";

function validateReboot(name: string, reboot: RebootOption | undefined): RebootOption {
  const r: RebootOption = reboot ?? { kind: "RebootIfNeeded" };
  if (r.kind === "NoReboot") {
    if (
      typeof r.hulumi_decision_comment !== "string" ||
      r.hulumi_decision_comment.trim().length < 8
    ) {
      throw new Error(
        `Ec2PatchBaseline: rebootOption.kind "NoReboot" requires hulumi_decision_comment (>= 8 chars) (component "${name}")`,
      );
    }
  } else if (r.kind !== "RebootIfNeeded") {
    throw new Error(
      `Ec2PatchBaseline: rebootOption.kind must be "RebootIfNeeded" or "NoReboot" (component "${name}")`,
    );
  }
  return r;
}

function validateCompliance(name: string, c: ComplianceMetric): ComplianceMetric {
  if (c === undefined || c.topicArn === undefined) {
    throw new Error(
      `Ec2PatchBaseline: complianceMetric.topicArn is required (component "${name}")`,
    );
  }
  const sevs = c.severities ?? ["CRITICAL", "IMPORTANT"];
  if (sevs.length === 0) {
    throw new Error(
      `Ec2PatchBaseline: complianceMetric.severities must be non-empty (component "${name}")`,
    );
  }
  if (sevs.length > MAX_COMPLIANCE_SEVERITIES) {
    throw new Error(
      `Ec2PatchBaseline: complianceMetric.severities has ${sevs.length} entries; max ${MAX_COMPLIANCE_SEVERITIES} (component "${name}")`,
    );
  }
  return { ...c, severities: sevs };
}

function validateStaggering(name: string, s: StaggeringConfig | undefined): number {
  const count = s?.bucketCount ?? 4;
  if (typeof count !== "number" || count < 1 || count > MAX_STAGGERING_BUCKETS) {
    throw new Error(
      `Ec2PatchBaseline: staggering.bucketCount must be 1..${MAX_STAGGERING_BUCKETS} (got ${count}) (component "${name}")`,
    );
  }
  return count;
}

export class Ec2PatchBaseline extends pulumi.ComponentResource implements Ec2PatchBaselineOutputs {
  public readonly patchBaselineId: pulumi.Output<string>;
  public readonly patchGroupTagValue: pulumi.Output<string>;
  public readonly maintenanceWindowId: pulumi.Output<string>;
  public readonly resourceDataSyncName: pulumi.Output<string>;
  public readonly rebootMode: pulumi.Output<"RebootIfNeeded" | "NoReboot">;
  public readonly noRebootDecisionComment: pulumi.Output<string | undefined>;
  public readonly complianceAlarmArn: pulumi.Output<string>;
  public readonly staggerBucketCount: pulumi.Output<number>;

  constructor(name: string, args: Ec2PatchBaselineArgs, opts?: pulumi.ComponentResourceOptions) {
    super(EC2_PATCH_BASELINE_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    if (!PATCH_GROUP_VALUES.has(args.patchGroup)) {
      throw new Error(
        `Ec2PatchBaseline: patchGroup must be one of "dev" | "staging" | "production" (got "${String(args.patchGroup)}") (component "${name}")`,
      );
    }
    if (typeof args.scheduleCron !== "string" || args.scheduleCron.trim() === "") {
      throw new Error(`Ec2PatchBaseline: scheduleCron is required (component "${name}")`);
    }
    if (!args.scheduleCron.startsWith("cron(") && !args.scheduleCron.startsWith("rate(")) {
      throw new Error(
        `Ec2PatchBaseline: scheduleCron must be a Maintenance-Windows cron(...) or rate(...) expression (got "${args.scheduleCron}") (component "${name}")`,
      );
    }
    const duration = args.durationHours ?? 4;
    if (duration < 1 || duration > 24) {
      throw new Error(
        `Ec2PatchBaseline: durationHours must be 1..24 (got ${duration}) (component "${name}")`,
      );
    }
    const cutoff = args.cutoffHours ?? 1;
    if (cutoff < 0 || cutoff >= duration) {
      throw new Error(
        `Ec2PatchBaseline: cutoffHours must be 0..durationHours-1 (got ${cutoff} vs duration ${duration}) (component "${name}")`,
      );
    }
    const reboot = validateReboot(name, args.rebootOption);
    const compliance = validateCompliance(name, args.complianceMetric);
    const bucketCount = validateStaggering(name, args.staggering);

    if (args.tier === "startup-hardened" && reboot.kind === "NoReboot") {
      throw new Error(
        `Ec2PatchBaseline: rebootOption.kind "NoReboot" is forbidden at tier "startup-hardened" — silent un-patching at startup-hardened is the breach risk this rule guards against (component "${name}")`,
      );
    }

    const tags: Record<string, string> = {
      ...(args.tags ?? {}),
      "hulumi:component": "Ec2PatchBaseline",
      "hulumi:tier": args.tier,
    };
    if (reboot.kind === "NoReboot") {
      tags[NO_REBOOT_COMMENT_TAG] = reboot.hulumi_decision_comment;
    }

    const parent = { parent: this } as const;

    const baseline = new aws.ssm.PatchBaseline(
      `${name}-baseline`,
      {
        name: `${name}-baseline`,
        operatingSystem: "AMAZON_LINUX_2",
        approvedPatchesComplianceLevel: "CRITICAL",
        approvalRules: [
          {
            approveAfterDays: args.tier === "startup-hardened" ? 3 : 7,
            patchFilters: [
              { key: "PRODUCT", values: ["AmazonLinux2"] },
              { key: "CLASSIFICATION", values: ["Security", "Bugfix"] },
              { key: "SEVERITY", values: ["Critical", "Important"] },
            ],
          },
        ],
        tags,
      },
      parent,
    );

    new aws.ssm.PatchGroup(
      `${name}-patch-group`,
      {
        baselineId: baseline.id,
        patchGroup: args.patchGroup,
      },
      parent,
    );

    const window = new aws.ssm.MaintenanceWindow(
      `${name}-window`,
      {
        name: `${name}-window`,
        schedule: args.scheduleCron,
        duration,
        cutoff,
        allowUnassociatedTargets: false,
        tags,
      },
      parent,
    );

    const target = new aws.ssm.MaintenanceWindowTarget(
      `${name}-target`,
      {
        name: `${name}-target`,
        windowId: window.id,
        resourceType: "INSTANCE",
        targets: [{ key: `tag:${PATCH_GROUP_TAG}`, values: [args.patchGroup] }],
      },
      parent,
    );

    new aws.ssm.MaintenanceWindowTask(
      `${name}-task`,
      {
        name: `${name}-task`,
        windowId: window.id,
        taskArn: "AWS-RunPatchBaseline",
        taskType: "RUN_COMMAND",
        priority: 1,
        maxConcurrency: `${100 / bucketCount}%`,
        maxErrors: "5%",
        serviceRoleArn: args.serviceRoleArn,
        targets: [{ key: "WindowTargetIds", values: [target.id] }],
        taskInvocationParameters: {
          runCommandParameters: {
            documentVersion: "$DEFAULT",
            parameters: [
              { name: "Operation", values: ["Install"] },
              {
                name: "RebootOption",
                values: [reboot.kind === "RebootIfNeeded" ? "RebootIfNeeded" : "NoReboot"],
              },
            ],
          },
        },
      },
      parent,
    );

    const sync = new aws.ssm.ResourceDataSync(
      `${name}-sync`,
      {
        name: `${name}-sync`,
        s3Destination: {
          bucketName: args.resourceDataSyncBucketName,
          syncFormat: "JsonSerDe",
          ...(args.region !== undefined ? { region: args.region } : { region: "us-east-1" }),
        },
      },
      parent,
    );

    const alarm = new aws.cloudwatch.MetricAlarm(
      `${name}-compliance-alarm`,
      {
        name: `${name}-compliance`,
        comparisonOperator: "GreaterThanOrEqualToThreshold",
        evaluationPeriods: 1,
        metricName: "ComplianceByPatchGroupNonCompliantInstances",
        namespace: "AWS/SSM-PatchManager",
        period: 3600,
        statistic: "Maximum",
        threshold: 1,
        dimensions: { PatchGroup: args.patchGroup },
        alarmActions: [compliance.topicArn],
        okActions: [compliance.topicArn],
        treatMissingData: "notBreaching",
        tags,
      },
      parent,
    );

    this.patchBaselineId = baseline.id;
    this.patchGroupTagValue = pulumi.output(args.patchGroup);
    this.maintenanceWindowId = window.id;
    this.resourceDataSyncName = sync.name;
    this.rebootMode = pulumi.output<"RebootIfNeeded" | "NoReboot">(reboot.kind);
    this.noRebootDecisionComment = pulumi.output(
      reboot.kind === "NoReboot" ? reboot.hulumi_decision_comment : undefined,
    );
    this.complianceAlarmArn = alarm.arn;
    this.staggerBucketCount = pulumi.output(bucketCount);

    this.registerOutputs({
      patchBaselineId: this.patchBaselineId,
      patchGroupTagValue: this.patchGroupTagValue,
      maintenanceWindowId: this.maintenanceWindowId,
      resourceDataSyncName: this.resourceDataSyncName,
      rebootMode: this.rebootMode,
      noRebootDecisionComment: this.noRebootDecisionComment,
      complianceAlarmArn: this.complianceAlarmArn,
      staggerBucketCount: this.staggerBucketCount,
    });
  }
}
