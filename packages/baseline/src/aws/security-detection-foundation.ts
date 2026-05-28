import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

import { IdentityAlarms } from "./identity-alarms";
import { assertValidTier } from "./tier";

import type {
  SecurityDetectionAdditionalEventRule,
  SecurityDetectionAlarmFamily,
  SecurityDetectionEvent,
  SecurityDetectionEventPattern,
  SecurityDetectionFamilyPosture,
  SecurityDetectionFoundationArgs,
  SecurityDetectionSeverity,
} from "./security-detection-foundation.args";
import {
  MAX_SECURITY_DETECTION_ADDITIONAL_RULES,
  SECURITY_DETECTION_ALARM_FAMILIES,
} from "./security-detection-foundation.args";
import type { SecurityDetectionFoundationOutputs } from "./security-detection-foundation.outputs";

export const SECURITY_DETECTION_FOUNDATION_COMPONENT_TYPE =
  "hulumi:baseline:aws:SecurityDetectionFoundation";

const VALID_FAMILIES: ReadonlySet<SecurityDetectionAlarmFamily> = new Set(
  SECURITY_DETECTION_ALARM_FAMILIES,
);

const FAMILY_SEVERITY: Record<SecurityDetectionAlarmFamily, SecurityDetectionSeverity> = {
  "identity-core": "critical",
  "org-guardrail": "critical",
  "state-backend": "high",
  "eks-control-plane": "high",
  "cloudtrail-kms-config": "critical",
  "security-service-disablement": "critical",
  "advisory-cost-anomaly": "medium",
};

const DEFAULT_ENABLED: Record<SecurityDetectionAlarmFamily, boolean> = {
  "identity-core": true,
  "org-guardrail": true,
  "state-backend": true,
  "eks-control-plane": true,
  "cloudtrail-kms-config": true,
  "security-service-disablement": true,
  "advisory-cost-anomaly": false,
};

const CRITICAL_FAMILIES = new Set<SecurityDetectionAlarmFamily>(
  SECURITY_DETECTION_ALARM_FAMILIES.filter((family) => FAMILY_SEVERITY[family] === "critical"),
);

export const SECURITY_DETECTION_EVENT_PATTERNS: Record<
  Exclude<SecurityDetectionAlarmFamily, "identity-core">,
  SecurityDetectionEventPattern
> = {
  "org-guardrail": {
    source: ["aws.organizations"],
    "detail-type": ["AWS API Call via CloudTrail"],
    detail: {
      eventSource: ["organizations.amazonaws.com"],
      eventName: [
        "DetachPolicy",
        "DisablePolicyType",
        "DeregisterDelegatedAdministrator",
        "DisableAWSServiceAccess",
      ],
    },
  },
  "state-backend": {
    source: ["aws.s3", "aws.kms"],
    "detail-type": ["AWS API Call via CloudTrail"],
    detail: {
      eventSource: ["s3.amazonaws.com", "kms.amazonaws.com"],
      eventName: [
        "DeleteBucketEncryption",
        "PutBucketPolicy",
        "DeleteBucketPolicy",
        "PutBucketVersioning",
        "DisableKey",
        "ScheduleKeyDeletion",
      ],
    },
  },
  "eks-control-plane": {
    source: ["aws.eks"],
    "detail-type": ["AWS API Call via CloudTrail"],
    detail: {
      eventSource: ["eks.amazonaws.com"],
      eventName: [
        "UpdateClusterConfig",
        "DeleteCluster",
        "AssociateAccessPolicy",
        "DisassociateAccessPolicy",
        "CreateAccessEntry",
        "DeleteAccessEntry",
      ],
    },
  },
  "cloudtrail-kms-config": {
    source: ["aws.cloudtrail", "aws.kms", "aws.config"],
    "detail-type": ["AWS API Call via CloudTrail"],
    detail: {
      eventSource: ["cloudtrail.amazonaws.com", "kms.amazonaws.com", "config.amazonaws.com"],
      eventName: [
        "StopLogging",
        "DeleteTrail",
        "UpdateTrail",
        "PutEventSelectors",
        "PutInsightSelectors",
        "DisableKey",
        "ScheduleKeyDeletion",
        "StopConfigurationRecorder",
        "DeleteConfigurationRecorder",
      ],
    },
  },
  "security-service-disablement": {
    source: ["aws.guardduty", "aws.securityhub", "aws.config"],
    "detail-type": ["AWS API Call via CloudTrail"],
    detail: {
      eventSource: ["guardduty.amazonaws.com", "securityhub.amazonaws.com", "config.amazonaws.com"],
      eventName: [
        "DeleteDetector",
        "UpdateDetector",
        "DisableSecurityHub",
        "StopConfigurationRecorder",
        "DeleteConfigurationRecorder",
      ],
    },
  },
  "advisory-cost-anomaly": {
    source: ["aws.ce"],
    "detail-type": ["Cost Anomaly Detection Alert"],
  },
};

export const SECURITY_DETECTION_SAMPLE_EVENTS: Record<
  Exclude<SecurityDetectionAlarmFamily, "identity-core">,
  SecurityDetectionEvent
> = {
  "org-guardrail": {
    source: "aws.organizations",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "organizations.amazonaws.com",
      eventName: "DetachPolicy",
    },
  },
  "state-backend": {
    source: "aws.s3",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "s3.amazonaws.com",
      eventName: "DeleteBucketEncryption",
    },
  },
  "eks-control-plane": {
    source: "aws.eks",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "eks.amazonaws.com",
      eventName: "UpdateClusterConfig",
    },
  },
  "cloudtrail-kms-config": {
    source: "aws.cloudtrail",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "cloudtrail.amazonaws.com",
      eventName: "StopLogging",
    },
  },
  "security-service-disablement": {
    source: "aws.guardduty",
    "detail-type": "AWS API Call via CloudTrail",
    detail: {
      eventSource: "guardduty.amazonaws.com",
      eventName: "DeleteDetector",
    },
  },
  "advisory-cost-anomaly": {
    source: "aws.ce",
    "detail-type": "Cost Anomaly Detection Alert",
    detail: {
      anomalyScore: "high",
    },
  },
};

function buildTags(
  family: SecurityDetectionAlarmFamily,
  severity: SecurityDetectionSeverity,
  tier: SecurityDetectionFoundationArgs["tier"],
  extra: Record<string, string> | undefined,
): Record<string, string> {
  return {
    ...(extra ?? {}),
    "hulumi:component": "SecurityDetectionFoundation",
    "hulumi:tier": tier,
    "hulumi:detection-family": family,
    "hulumi:detection-severity": severity,
  };
}

function isKnownFamily(value: string): value is SecurityDetectionAlarmFamily {
  return VALID_FAMILIES.has(value as SecurityDetectionAlarmFamily);
}

function validateFamilies(name: string, args: SecurityDetectionFoundationArgs): void {
  for (const family of Object.keys(args.enabledFamilies ?? {})) {
    if (!isKnownFamily(family)) {
      throw new Error(
        `SecurityDetectionFoundation: unknown alarm family "${family}" (component "${name}")`,
      );
    }
  }
  if (args.tier === "startup-hardened") {
    for (const family of CRITICAL_FAMILIES) {
      if (args.enabledFamilies?.[family] === false) {
        throw new Error(
          `SecurityDetectionFoundation: startup-hardened critical alarm family "${family}" cannot be disabled (component "${name}")`,
        );
      }
    }
  }
}

function validateTopic(
  name: string,
  label: "criticalTopicArn" | "highTopicArn" | "mediumTopicArn",
  value: pulumi.Input<string> | undefined,
  required: boolean,
): void {
  if (required && value === undefined) {
    throw new Error(`SecurityDetectionFoundation: ${label} is required (component "${name}")`);
  }
  if (typeof value === "string" && value.trim() === "") {
    throw new Error(`SecurityDetectionFoundation: ${label} is required (component "${name}")`);
  }
}

function enabled(args: SecurityDetectionFoundationArgs, family: SecurityDetectionAlarmFamily) {
  return args.enabledFamilies?.[family] ?? DEFAULT_ENABLED[family];
}

function actionForSeverity(
  args: SecurityDetectionFoundationArgs,
  severity: SecurityDetectionSeverity,
): pulumi.Input<string> | undefined {
  if (severity === "critical") return args.criticalTopicArn;
  if (severity === "high") return args.highTopicArn;
  return args.mediumTopicArn;
}

function matchPatternValue(pattern: unknown, eventValue: unknown): boolean {
  if (Array.isArray(pattern)) {
    return pattern.some((candidate) => candidate === eventValue);
  }
  if (pattern !== null && typeof pattern === "object") {
    if (eventValue === null || typeof eventValue !== "object") return false;
    return Object.entries(pattern as Record<string, unknown>).every(([key, nested]) =>
      matchPatternValue(nested, (eventValue as Record<string, unknown>)[key]),
    );
  }
  return pattern === eventValue;
}

export function matchesSecurityDetectionPattern(
  pattern: SecurityDetectionEventPattern,
  event: SecurityDetectionEvent,
): boolean {
  return Object.entries(pattern).every(([key, value]) => matchPatternValue(value, event[key]));
}

export function assertSecurityDetectionPatternNotCatchAll(
  pattern: SecurityDetectionEventPattern,
  name: string,
  advisory: boolean,
): void {
  if (advisory) return;
  const source = pattern.source;
  if (!Array.isArray(source) || source.length === 0 || source.includes("*")) {
    throw new Error(
      `SecurityDetectionFoundation: event pattern "${name}" is a catch-all; make it finite or mark it advisory`,
    );
  }
}

function validateAdditionalRules(
  name: string,
  rules: SecurityDetectionAdditionalEventRule[] | undefined,
): SecurityDetectionAdditionalEventRule[] {
  const additional = rules ?? [];
  if (additional.length > MAX_SECURITY_DETECTION_ADDITIONAL_RULES) {
    throw new Error(
      `SecurityDetectionFoundation: additionalEventRules has ${additional.length} entries; max ${MAX_SECURITY_DETECTION_ADDITIONAL_RULES} (component "${name}")`,
    );
  }
  for (const rule of additional) {
    if (rule.name.trim() === "") {
      throw new Error(
        `SecurityDetectionFoundation: additionalEventRules names must be non-empty (component "${name}")`,
      );
    }
    if (!isKnownFamily(rule.family)) {
      throw new Error(
        `SecurityDetectionFoundation: unknown alarm family "${rule.family}" (component "${name}")`,
      );
    }
    assertSecurityDetectionPatternNotCatchAll(rule.eventPattern, rule.name, rule.advisory === true);
  }
  return additional;
}

export class SecurityDetectionFoundation
  extends pulumi.ComponentResource
  implements SecurityDetectionFoundationOutputs
{
  public readonly enabledFamilies: pulumi.Output<SecurityDetectionAlarmFamily[]>;
  public readonly disabledAdvisoryFamilies: pulumi.Output<SecurityDetectionAlarmFamily[]>;
  public readonly familyPosture: pulumi.Output<
    Record<SecurityDetectionAlarmFamily, SecurityDetectionFamilyPosture>
  >;
  public readonly identityAlarmArns: pulumi.Output<string[]>;
  public readonly eventRuleArns: pulumi.Output<string[]>;
  public readonly validatorChecks: pulumi.Output<string[]>;
  public readonly sampleEventFixtureCount: pulumi.Output<number>;

  constructor(
    name: string,
    args: SecurityDetectionFoundationArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(SECURITY_DETECTION_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    validateTopic(name, "criticalTopicArn", args.criticalTopicArn, true);
    validateTopic(name, "highTopicArn", args.highTopicArn, true);
    validateTopic(name, "mediumTopicArn", args.mediumTopicArn, false);
    validateFamilies(name, args);
    const additionalRules = validateAdditionalRules(name, args.additionalEventRules);

    const parent = { parent: this } as const;
    const prefix = args.namePrefix ?? name;
    const enabledFamilies: SecurityDetectionAlarmFamily[] = [];
    const disabledAdvisoryFamilies: SecurityDetectionAlarmFamily[] = [];
    const posture: Record<SecurityDetectionAlarmFamily, SecurityDetectionFamilyPosture> = {
      "identity-core": "disabled",
      "org-guardrail": "disabled",
      "state-backend": "disabled",
      "eks-control-plane": "disabled",
      "cloudtrail-kms-config": "disabled",
      "security-service-disablement": "disabled",
      "advisory-cost-anomaly": "disabled",
    };

    const identityAlarmArns: pulumi.Output<string>[] = [];
    const eventRuleArns: pulumi.Output<string>[] = [];
    const validatorChecks: string[] = [];

    if (enabled(args, "identity-core")) {
      const identity = new IdentityAlarms(
        `${name}-identity`,
        {
          tier: args.tier,
          trailLogGroupName: args.trailLogGroupName,
          criticalTopicArn: args.criticalTopicArn,
          highTopicArn: args.highTopicArn,
          ...(args.runbookUrl !== undefined ? { runbookUrl: args.runbookUrl } : {}),
          namePrefix: prefix,
          extraTags: {
            ...(args.tags ?? {}),
            "hulumi:detection-family": "identity-core",
          },
        },
        parent,
      );
      enabledFamilies.push("identity-core");
      posture["identity-core"] = "enabled";
      identityAlarmArns.push(...identity.alarmArns);
      validatorChecks.push("logs:metric-filter:identity-core", "cloudwatch:alarm:identity-core");
    }

    const createEventRule = (
      family: Exclude<SecurityDetectionAlarmFamily, "identity-core">,
      pattern: SecurityDetectionEventPattern,
      ruleNameSuffix: string,
      advisory: boolean,
    ): void => {
      const severity = FAMILY_SEVERITY[family];
      const action = actionForSeverity(args, severity);
      if (action === undefined) {
        if (severity === "medium" || advisory) {
          disabledAdvisoryFamilies.push(family);
          posture[family] = "advisory-disabled";
          return;
        }
        throw new Error(
          `SecurityDetectionFoundation: ${severity} family "${family}" has no action topic (component "${name}")`,
        );
      }

      const eventRule = new aws.cloudwatch.EventRule(
        `${name}-rule-${ruleNameSuffix}`,
        {
          name: `${prefix}-${ruleNameSuffix}`,
          eventPattern: JSON.stringify(pattern),
          tags: buildTags(family, severity, args.tier, {
            ...(args.tags ?? {}),
            ...(advisory ? { "hulumi:detection-advisory": "true" } : {}),
          }),
        },
        parent,
      );
      new aws.cloudwatch.EventTarget(
        `${name}-target-${ruleNameSuffix}`,
        {
          rule: eventRule.name,
          arn: action,
        },
        parent,
      );
      eventRuleArns.push(eventRule.arn);
      if (!enabledFamilies.includes(family)) enabledFamilies.push(family);
      posture[family] = "enabled";
      validatorChecks.push(`eventbridge:rule-target:${family}`);
    };

    for (const family of SECURITY_DETECTION_ALARM_FAMILIES) {
      if (family === "identity-core") continue;
      if (!enabled(args, family)) {
        posture[family] = family === "advisory-cost-anomaly" ? "advisory-disabled" : "disabled";
        if (family === "advisory-cost-anomaly") disabledAdvisoryFamilies.push(family);
        continue;
      }
      createEventRule(family, SECURITY_DETECTION_EVENT_PATTERNS[family], family, false);
    }

    additionalRules.forEach((rule, index) => {
      createEventRule(
        rule.family,
        rule.eventPattern,
        `extra-${index}-${rule.name}`,
        rule.advisory === true,
      );
    });

    this.enabledFamilies = pulumi.output(enabledFamilies);
    this.disabledAdvisoryFamilies = pulumi.output([...new Set(disabledAdvisoryFamilies)]);
    this.familyPosture = pulumi.output(posture);
    this.identityAlarmArns = pulumi.all(identityAlarmArns).apply((arns) => arns);
    this.eventRuleArns = pulumi.all(eventRuleArns).apply((arns) => arns);
    this.validatorChecks = pulumi.output(validatorChecks);
    this.sampleEventFixtureCount = pulumi.output(
      Object.keys(SECURITY_DETECTION_SAMPLE_EVENTS).length,
    );

    this.registerOutputs({
      enabledFamilies: this.enabledFamilies,
      disabledAdvisoryFamilies: this.disabledAdvisoryFamilies,
      familyPosture: this.familyPosture,
      identityAlarmArns: this.identityAlarmArns,
      eventRuleArns: this.eventRuleArns,
      validatorChecks: this.validatorChecks,
      sampleEventFixtureCount: this.sampleEventFixtureCount,
    });
  }
}
