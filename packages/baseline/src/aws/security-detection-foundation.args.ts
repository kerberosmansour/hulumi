import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export const SECURITY_DETECTION_ALARM_FAMILIES = [
  "identity-core",
  "org-guardrail",
  "state-backend",
  "eks-control-plane",
  "cloudtrail-kms-config",
  "security-service-disablement",
  "advisory-cost-anomaly",
] as const;

export type SecurityDetectionAlarmFamily = (typeof SECURITY_DETECTION_ALARM_FAMILIES)[number];

export type SecurityDetectionSeverity = "critical" | "high" | "medium";

export type SecurityDetectionFamilyPosture = "enabled" | "disabled" | "advisory-disabled";

export const MAX_SECURITY_DETECTION_ADDITIONAL_RULES = 8;

export interface SecurityDetectionEventPattern {
  source?: string[];
  "detail-type"?: string[];
  detail?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SecurityDetectionEvent {
  source?: string;
  "detail-type"?: string;
  detail?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SecurityDetectionAdditionalEventRule {
  name: string;
  family: Exclude<SecurityDetectionAlarmFamily, "identity-core">;
  severity: SecurityDetectionSeverity;
  eventPattern: SecurityDetectionEventPattern;
  advisory?: boolean;
  description?: string;
}

export interface SecurityDetectionFoundationArgs {
  tier: Tier;
  trailLogGroupName: pulumi.Input<string>;
  criticalTopicArn: pulumi.Input<string>;
  highTopicArn: pulumi.Input<string>;
  mediumTopicArn?: pulumi.Input<string>;
  runbookUrl?: pulumi.Input<string>;
  namePrefix?: string;
  enabledFamilies?: Partial<Record<SecurityDetectionAlarmFamily, boolean>>;
  additionalEventRules?: SecurityDetectionAdditionalEventRule[];
  tags?: Record<string, string>;
}
