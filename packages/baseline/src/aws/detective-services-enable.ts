import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import type { DetectiveServicesEnableArgs } from "./detective-services-enable.args";
import { MAX_DETECTIVE_EVENT_PATTERNS } from "./detective-services-enable.args";
import type { DetectiveServicesEnableOutputs } from "./detective-services-enable.outputs";
import { assertValidTier } from "./tier";

export const DETECTIVE_SERVICES_ENABLE_COMPONENT_TYPE =
  "hulumi:baseline:aws:DetectiveServicesEnable";

const KEV_PATTERN = JSON.stringify({
  source: ["aws.inspector2"],
  "detail-type": ["Inspector2 Finding"],
  detail: { inspectorScore: { codeVulnerability: { cisaData: { knownExploit: ["KNOWN"] } } } },
});

const PRIMARY_PATTERN = JSON.stringify({
  source: [
    "aws.guardduty",
    "aws.access-analyzer",
    "aws.inspector2",
    "aws.ce", // Cost Explorer / Cost Anomaly
  ],
});

function validatePatterns(name: string, patterns: string[] | undefined): string[] {
  const ps = patterns ?? [];
  if (ps.length > MAX_DETECTIVE_EVENT_PATTERNS) {
    throw new Error(
      `DetectiveServicesEnable: additionalEventPatterns has ${ps.length} entries; max ${MAX_DETECTIVE_EVENT_PATTERNS} (component "${name}")`,
    );
  }
  for (const p of ps) {
    if (typeof p !== "string" || p.trim() === "") {
      throw new Error(
        `DetectiveServicesEnable: additionalEventPatterns entries must be non-empty strings (component "${name}")`,
      );
    }
    try {
      JSON.parse(p);
    } catch {
      throw new Error(
        `DetectiveServicesEnable: additionalEventPatterns entries must be valid JSON strings (component "${name}")`,
      );
    }
  }
  return ps;
}

export class DetectiveServicesEnable
  extends pulumi.ComponentResource
  implements DetectiveServicesEnableOutputs
{
  public readonly servicesEnabled: pulumi.Output<string[]>;
  public readonly eventBridgeRuleArns: pulumi.Output<string[]>;
  public readonly kevDualRoutingActive: pulumi.Output<boolean>;

  constructor(
    name: string,
    args: DetectiveServicesEnableArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(DETECTIVE_SERVICES_ENABLE_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    if (args.findingsRoutingSnsArn === undefined) {
      throw new Error(
        `DetectiveServicesEnable: findingsRoutingSnsArn is required (component "${name}")`,
      );
    }
    const patterns = validatePatterns(name, args.additionalEventPatterns);

    const enableAa = args.enableAccessAnalyzer !== false;
    const enableInspector = args.enableInspectorV2 !== false;
    const enableCost = args.enableCostAnomalyDetection !== false;
    const kevDual = args.findingsKevRoutingSnsArn !== undefined;

    const parent = { parent: this } as const;
    const services: string[] = [];
    const ruleArns: pulumi.Output<string>[] = [];

    if (enableAa) {
      new aws.accessanalyzer.Analyzer(
        `${name}-access-analyzer`,
        {
          analyzerName: `${name}-access-analyzer`,
          type: "ACCOUNT",
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        },
        parent,
      );
      services.push("AccessAnalyzer");
    }

    if (enableInspector) {
      new aws.inspector2.Enabler(
        `${name}-inspector2`,
        {
          accountIds: [aws.getCallerIdentityOutput({}).accountId],
          resourceTypes: ["EC2", "ECR", "LAMBDA"],
        },
        parent,
      );
      services.push("InspectorV2");
    }

    if (enableCost) {
      const monitor = new aws.costexplorer.AnomalyMonitor(
        `${name}-cost-monitor`,
        {
          name: `${name}-cost-monitor`,
          monitorType: "DIMENSIONAL",
          monitorDimension: "SERVICE",
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        },
        parent,
      );
      new aws.costexplorer.AnomalySubscription(
        `${name}-cost-sub`,
        {
          name: `${name}-cost-sub`,
          monitorArnLists: [monitor.arn],
          frequency: "DAILY",
          subscribers: [{ type: "SNS", address: args.findingsRoutingSnsArn }],
          thresholdExpression: {
            dimension: {
              key: "ANOMALY_TOTAL_IMPACT_PERCENTAGE",
              matchOptions: ["GREATER_THAN_OR_EQUAL"],
              values: ["10"],
            },
          },
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        },
        parent,
      );
      services.push("CostAnomalyDetection");
    }

    // EventBridge primary routing
    const primaryRule = new aws.cloudwatch.EventRule(
      `${name}-primary-rule`,
      {
        name: `${name}-primary-rule`,
        eventPattern: PRIMARY_PATTERN,
        ...(args.tags !== undefined ? { tags: args.tags } : {}),
      },
      parent,
    );
    new aws.cloudwatch.EventTarget(
      `${name}-primary-target`,
      {
        rule: primaryRule.name,
        arn: args.findingsRoutingSnsArn,
      },
      parent,
    );
    ruleArns.push(primaryRule.arn);

    if (kevDual) {
      const kevRule = new aws.cloudwatch.EventRule(
        `${name}-kev-rule`,
        {
          name: `${name}-kev-rule`,
          eventPattern: KEV_PATTERN,
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        },
        parent,
      );
      new aws.cloudwatch.EventTarget(
        `${name}-kev-target`,
        {
          rule: kevRule.name,
          arn: args.findingsKevRoutingSnsArn as pulumi.Input<string>,
        },
        parent,
      );
      ruleArns.push(kevRule.arn);
    }

    patterns.forEach((p, i) => {
      const rule = new aws.cloudwatch.EventRule(
        `${name}-extra-rule-${i}`,
        {
          name: `${name}-extra-rule-${i}`,
          eventPattern: p,
          ...(args.tags !== undefined ? { tags: args.tags } : {}),
        },
        parent,
      );
      new aws.cloudwatch.EventTarget(
        `${name}-extra-target-${i}`,
        {
          rule: rule.name,
          arn: args.findingsRoutingSnsArn,
        },
        parent,
      );
      ruleArns.push(rule.arn);
    });

    this.servicesEnabled = pulumi.output(services);
    this.eventBridgeRuleArns = pulumi.all(ruleArns).apply((arr) => arr);
    this.kevDualRoutingActive = pulumi.output(kevDual);
    this.registerOutputs({
      servicesEnabled: this.servicesEnabled,
      eventBridgeRuleArns: this.eventBridgeRuleArns,
      kevDualRoutingActive: this.kevDualRoutingActive,
    });
  }
}
