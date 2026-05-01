# Lessons Learned — hulumi-operations Milestone 2 (combined M8)

## What changed

- `DetectiveServicesEnable` in `@hulumi/baseline.aws` — Access Analyzer + Inspector v2 + Cost Anomaly Detection, with EventBridge primary routing to `findingsRoutingSnsArn` and optional KEV-only dual routing to `findingsKevRoutingSnsArn`.
- Bound on `additionalEventPatterns` (16). Each pattern is JSON-validated at construction.

## Design decisions and why

- **KEV dual routing with a typed output flag (`kevDualRoutingActive: Output<boolean>`)** — operators reading the stack outputs see whether the dedicated topic is in use. Mirrors M5's `runtimeMonitoringUnsupported` discoverability pattern.
- **`PRIMARY_PATTERN` covers GuardDuty + Access Analyzer + Inspector + Cost Explorer in one rule**, not per-source rules. EventBridge rule cap is 300 per bus, but we don't need to burn one rule per source. The KEV pattern is a SECOND rule because it filters Inspector v2 specifically.
- **Inspector v2 enabler uses `getCallerIdentityOutput().accountId`** — avoids forcing the consumer to thread the account ID through args.
- **Each opt-out flag (`enableAccessAnalyzer`, `enableInspectorV2`, `enableCostAnomalyDetection`) defaults to `true`** — opt-out, not opt-in. Catches the foot-gun of forgetting to enable detective services.
- **Cost Anomaly threshold defaults to 10% impact** — empirically the lowest threshold that doesn't drown operators in spurious anomaly events.

## Invariants

- `findingsRoutingSnsArn` required.
- `additionalEventPatterns` entries must be valid JSON.
- `additionalEventPatterns.length ≤ 16`.

## Bounds

- `MAX_DETECTIVE_EVENT_PATTERNS = 16`.

## Carry-forward

- The KEV dual-routing pattern (typed output + optional secondary topic) generalizes to any "high-priority subset" routing shape M9+ might need (e.g. CloudTrail "stop trail" events to pager).
- The single primary EventRule with multi-source `source: [...]` array is the cheapest route shape; M9/M10 should reuse it.
