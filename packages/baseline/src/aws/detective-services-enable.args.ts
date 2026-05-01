import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

/** Bound on `additionalEventPatterns` (each emits its own EventBridge rule). */
export const MAX_DETECTIVE_EVENT_PATTERNS = 16;

export interface DetectiveServicesEnableArgs {
  tier: Tier;
  /**
   * SNS topic ARN that receives the bulk of detective-service findings via
   * EventBridge. Required.
   */
  findingsRoutingSnsArn: pulumi.Input<string>;
  /**
   * Optional secondary SNS topic for CISA-KEV (Known Exploited Vulnerabilities)
   * findings — Inspector v2 findings whose `inspectorScore.codeVulnerability`
   * indicators reference a KEV CVE. When unset, KEV findings flow through the
   * primary topic.
   */
  findingsKevRoutingSnsArn?: pulumi.Input<string>;
  /** Default `true`. Enables AWS IAM Access Analyzer at the account level. */
  enableAccessAnalyzer?: boolean;
  /** Default `true`. Enables AWS Inspector v2 (EC2, ECR, Lambda code/package). */
  enableInspectorV2?: boolean;
  /** Default `true`. Enables AWS Cost Anomaly Detection (account-level monitor + subscription). */
  enableCostAnomalyDetection?: boolean;
  /**
   * Custom EventBridge event patterns to also route to `findingsRoutingSnsArn`.
   * Bounded at {@link MAX_DETECTIVE_EVENT_PATTERNS}. Each entry must be a
   * valid EventBridge JSON pattern string.
   */
  additionalEventPatterns?: string[];
  tags?: Record<string, string>;
}
