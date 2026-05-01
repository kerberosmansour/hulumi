---
title: DetectiveServicesEnable
description: Enables AWS Access Analyzer, Inspector v2, Cost Anomaly Detection, and routes their findings via EventBridge to a consumer SNS topic. Optional dual routing for KEV (CISA Known Exploited Vulnerabilities) findings.
---

# `DetectiveServicesEnable`

`@hulumi/baseline.aws.DetectiveServicesEnable` — wraps account-level detective services and their EventBridge routes (M8 / Ops M2):

- `aws.accessanalyzer.Analyzer` — IAM Access Analyzer (account scope).
- `aws.inspector2.Enabler` — Inspector v2 for EC2 + ECR + Lambda.
- `aws.costexplorer.AnomalyMonitor` + `AnomalySubscription` — daily cost anomaly delivery to the consumer's SNS topic.
- `aws.cloudwatch.EventRule` + `EventTarget` — primary route for GuardDuty / Inspector / Access Analyzer / Cost Explorer findings.
- Optional **KEV dual routing**: when `findingsKevRoutingSnsArn` is set, Inspector v2 findings whose `inspectorScore.codeVulnerability.cisaData.knownExploit === "KNOWN"` flow to the dedicated topic. KEV findings are pager-worthy.

## Quick start

```ts
new DetectiveServicesEnable("account-detective", {
  tier: "startup-hardened",
  findingsRoutingSnsArn: monitoring.alarmTopicArn,
  findingsKevRoutingSnsArn: pagerDutyTopic.arn, // KEV-only
});
```

## Bounds

- `MAX_DETECTIVE_EVENT_PATTERNS = 16` — additional EventBridge rules.

Source: [packages/baseline/src/aws/detective-services-enable.ts](../../packages/baseline/src/aws/detective-services-enable.ts).
