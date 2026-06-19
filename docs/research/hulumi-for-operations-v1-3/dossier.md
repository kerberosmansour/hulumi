---
slug: hulumi-for-operations-v1-3
created: 2026-05-29
status: complete
source_idea: docs/slo/idea/hulumi-for-operations-v1-3.md
filed_by: hulumi-ops-v1-3-research-kickoff routine
---

# Research dossier: Hulumi for Operations v1.3 open questions

Auto-filed 2026-05-29. Answers the four `## Open questions for /slo-research` from
`docs/slo/idea/hulumi-for-operations-v1-3.md`. v1.2.0 ship-check passed (GitHub release
non-draft, all four npm packages at 1.2.0) before this dossier was generated.

---

## Question 1

**`aws.cloudwatch.EventApiDestination` payload customization** — how flexible is the
input transformer when an EventBridge rule targets an API destination? Can the JSON
payload sent to GitHub `repository_dispatch` inject `{cve_id, ecr_image_digest,
severity, kev_added_date}` from an Inspector v2 finding into the dispatch's
`client_payload` field?

### Sources

- AWS docs: [Amazon EventBridge input transformation](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-transform-target-input.html)
- AWS docs: [API destinations as targets in Amazon EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-api-destinations.html)
- AWS API reference: [InputTransformer](https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_InputTransformer.html)
- AWS blog: [Using API destinations with Amazon EventBridge](https://aws.amazon.com/blogs/compute/using-api-destinations-with-amazon-eventbridge/)
- Community post: [Customize EventBridge notifications using input transformer](https://repost.aws/knowledge-center/eventbridge-human-readable-notifications)

### Findings

**Yes — full payload injection is supported and is the intended use case.**

EventBridge's `InputTransformer` has two parts:

1. **`InputPathsMap`** — a dictionary of up to 100 named variables, each mapped to a
   JSONPath expression that extracts a value from the matched event. Dot notation and
   array indexing are supported.
2. **`InputTemplate`** — a JSON string template referencing the variables from
   `InputPathsMap` using `<variable_name>` syntax. The template replaces the event
   payload wholesale before sending it to the target (the API destination endpoint).

Inspector v2 `Security Hub Findings - Imported` events carry all four required fields.
A working `InputTransformer` for M4's `ContainerImageRebuildTrigger` would be:

```json
{
  "InputPathsMap": {
    "cve_id":           "$.detail.findings[0].PackageVulnerabilityDetails.VulnerabilityId",
    "ecr_image_digest": "$.detail.findings[0].Resources[0].Details.AwsEcrContainerImage.ImageDigest",
    "severity":         "$.detail.findings[0].Severity.Label",
    "kev_added_date":   "$.detail.findings[0].PackageVulnerabilityDetails.VendorCreatedAt"
  },
  "InputTemplate": "{\"event_type\":\"inspector-kev-finding\",\"client_payload\":{\"cve_id\":\"<cve_id>\",\"ecr_image_digest\":\"<ecr_image_digest>\",\"severity\":\"<severity>\",\"kev_added_date\":\"<kev_added_date>\"}}"
}
```

The `InputTemplate` string is sent verbatim as the HTTP request body to the API
destination (GitHub's `POST /repos/{owner}/{repo}/dispatches` endpoint). The resulting
body satisfies the `repository_dispatch` schema:

```json
{
  "event_type": "inspector-kev-finding",
  "client_payload": {
    "cve_id": "CVE-2026-1234",
    "ecr_image_digest": "sha256:abc...",
    "severity": "CRITICAL",
    "kev_added_date": "2026-05-15T00:00:00Z"
  }
}
```

**Key limits and caveats:**

- **100-variable cap** on `InputPathsMap` — not a concern for M4's four-field payload.
- **`findings[0]` indexing** — Inspector v2 can batch multiple findings in a single
  event. The `[0]` index picks the first. To guarantee one finding per event, configure
  the EventBridge rule's event pattern filter to match only single-resource, CRITICAL-
  severity, KEV-listed findings. Inspector v2 supports `detail.findings[0].VulnId` in
  patterns; filtering prevents multi-finding batches from silently truncating to only
  the first CVE.
- **`VendorCreatedAt` vs KEV date** — Inspector v2 enriches EPSS and KEV data but the
  field surfaced as `VendorCreatedAt` is the NVD/vendor publish date, not the CISA KEV
  add date. For strict KEV audit trails, `client_payload` should add
  `"kev_source": "inspector-v2-kev-enriched"` to make the provenance explicit. The CISA
  KEV add date itself is available via Inspector v2 native KEV annotations
  (`detail.findings[0].PackageVulnerabilityDetails.ReferenceUrls` contains the CISA
  KEV entry URL, but not a parsed date field). Hulumi M4 should document this nuance in
  the `ContainerImageRebuildTrigger` prop interface JSDoc.
- **No Lambda required** — the `InputTransformer` + `aws.cloudwatch.EventApiDestination`
  path is purely declarative. Hulumi ships no Lambda. ✓

### Recommendation

M4's `ContainerImageRebuildTrigger` **can and should** use `InputTransformer` to inject
all four fields into `client_payload`. Include a `hubKevAnnotationNote` in the prop
interface clarifying the `kev_added_date` provenance limitation. Add an EventBridge
rule event-pattern filter on `severity: ["CRITICAL"]` and
`detail.findings[0].PackageVulnerabilityDetails.IsVendorSeverity: [true]` to prevent
multi-finding batches from silently dropping findings 1..N.

---

## Question 2

**EC2 Image Builder cost at sunlit-shape fleet** — current 2026 cost per build minute.
Monthly cost for daily AMI rebuild (~30 min/build) + 3 distribution targets in
eu-west-2. Compare vs v1.2 cost line items (Inspector v2 ~$1.26/EC2/month, Client VPN
$73/month, EKS control plane $73/month). Assess Sandbox vs StartupHardened
affordability.

### Sources

- AWS: [EC2 Image Builder pricing page](https://aws.amazon.com/image-builder/) — "No additional charge. You pay only for the AWS resources used."
- Oreate AI blog: [Demystifying EC2 Image Builder Pricing](https://www.oreateai.com/blog/demystifying-ec2-image-builder-pricing-what-you-need-to-know/e4b8c3fbd59d80c7305a028358b0bea0)
- AWS: [EC2 On-Demand pricing (eu-west-2)](https://aws.amazon.com/ec2/pricing/on-demand/)
- AWS: [EBS pricing](https://aws.amazon.com/ebs/pricing/)

### Findings

**EC2 Image Builder itself: $0.00/build-minute.** AWS charges nothing for the pipeline
orchestration service. Costs are entirely from underlying resources:

| Resource | Unit cost (eu-west-2, 2026) | Monthly cost — daily rebuild 30 min/build |
|---|---|---|
| EC2 build instance (m5.large) | $0.096/hr | 30 builds × 0.5 hr × $0.096 = **$1.44** |
| EC2 build instance (t3.medium, alt) | $0.0416/hr | 30 × 0.5 × $0.0416 = **$0.62** |
| EBS gp3 root vol during build (30 GB, 30 min/day) | $0.088/GB-month pro-rated | ~**$0.07** |
| AMI snapshot storage — source region (eu-west-2), 7-day retention, ~20 GB/AMI, incremental after first | $0.05/GB-month | 7 AMIs × ~5 GB avg incremental × $0.05 = **$1.75** |
| AMI copy to 2 additional distribution targets (×2 regions), same retention | $0.05/GB-month per region | 7 AMIs × 2 regions × 5 GB × $0.05 = **$3.50** |
| S3 logs (Image Builder output, ~10 MB/build) | $0.023/GB | negligible < **$0.01** |

**Total estimated monthly cost (daily rebuild, 3 distribution targets, 7-day retention):**

- With m5.large build instance: **~$6.76/month**
- With t3.medium build instance: **~$5.94/month**
- Conservative worst-case (first-run full snapshots, 30 GB AMI, no lifecycle): ~$35/month

**Tier assessment:**

| Tier | Cadence | Estimated cost | Affordable? |
|---|---|---|---|
| Sandbox | Weekly (1 build/week) | ~$1.50/month | ✓ trivially affordable |
| StartupHardened | Daily (30/month) | ~$6-7/month | ✓ affordable |
| StartupHardened worst-case | Daily, large AMI, no lifecycle | ~$35/month | ✓ still < EKS control plane ($73/month) |

**Comparison with v1.2 cost line items:**

| v1.2 cost item | Monthly | vs Image Builder daily rebuild |
|---|---|---|
| Inspector v2 per EC2 | $1.26/EC2 | Image Builder ~$0.23/build < Inspector per EC2 |
| Client VPN endpoint | $73/month | Image Builder 10× cheaper |
| EKS control plane | $73/month | Image Builder 10× cheaper |

Daily AMI rebuild for a startup (StartupHardened, 3 regions) costs roughly the same as
**5-6 EC2 instances under Inspector v2 coverage** — a fraction of the existing v1.2
infrastructure spend.

**Key caveat:** snapshot storage grows if lifecycle policies aren't configured. The v1.3
`Ec2GoldenAmiPipeline` component **must** default to a 7-day retention `lifecyclePolicy`
on the Image Builder distribution configuration (and the corresponding EBS Snapshot
Lifecycle Policy on AMIs). Without this, monthly costs compound linearly with build
count.

### Recommendation

Daily rebuild + 3 distribution targets is **affordable for both Sandbox and
StartupHardened** tiers. Confirm that `Ec2GoldenAmiPipeline` ships with a default
7-day AMI retention lifecycle policy (fail-loud at StartupHardened if consumer
overrides to >30 days without explicit acknowledgement). Recommend m5.large as the
default build instance type for performance/cost balance; expose as an overridable prop
for consumers with large AMIs.

---

## Question 3

**GitHub `repository_dispatch` rate limits + retry semantics** — REST API rate limit on
`POST /repos/{owner}/{repo}/dispatches`, response codes when limited, EventBridge API
destination retry policy + DLQ behavior. Recommend whether v1.3 M4 needs a
Hulumi-shipped DLQ pattern or whether AWS-native retry is sufficient.

### Sources

- GitHub Docs: [Rate limits for the REST API](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- GitHub Docs: [REST API endpoints for rate limits](https://docs.github.com/en/rest/rate-limit/rate-limit)
- GitHub Docs: [Troubleshooting the REST API](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api)
- AWS docs: [How EventBridge retries delivering events](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html)
- AWS docs: [Using dead-letter queues in EventBridge](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html)
- AWS re:Post: [Configure EventBridge retries and DLQ for failed invocations](https://repost.aws/knowledge-center/eventbridge-resolve-failedinvocation-errors)
- Lunar.dev: [Managing Rate Limits for the GitHub API](https://www.lunar.dev/post/a-developers-guide-managing-rate-limits-for-the-github-api)

### Findings

**GitHub `repository_dispatch` rate limits:**

| Auth type | Primary limit | Secondary limit |
|---|---|---|
| `GITHUB_TOKEN` / fine-grained PAT | 1,000 req/hr/repo | 900 points/min (REST) |
| GitHub App installation token | 15,000 req/hr/repo (GHEC) | same |

`POST /repos/{owner}/{repo}/dispatches` is a standard REST endpoint subject to both
limits. Inspector v2 KEV findings for a typical startup fleet are low-volume (single
digits per week at most — CISA KEV adds ~2-3 new entries/week on average). The primary
rate limit is not a practical concern for M4.

**Rate limit response codes from GitHub:**
- Primary limit exhausted: **HTTP 403** with `x-ratelimit-remaining: 0` and
  `x-ratelimit-reset: <unix timestamp>`
- Secondary limit hit: **HTTP 429** or **HTTP 403** with body
  `{"message": "You have exceeded a secondary rate limit..."}`
- Both include a `retry-after` response header specifying seconds to wait

**EventBridge API destination retry policy:**
- EventBridge retries on **all 4xx and 5xx HTTP responses** (including 403 and 429)
  with exponential backoff + jitter
- Retry window: **up to 24 hours**, **maximum 185 attempts**
- Per-request timeout: **5 seconds** (if GitHub does not respond in 5s, EventBridge
  counts it as a failure and retries)
- EventBridge does NOT read `retry-after` or `x-ratelimit-reset` headers — it uses its
  own exponential backoff schedule. This means EventBridge may retry faster than GitHub's
  rate limit window, but 185 attempts over 24 hours averages to ~1 retry/7.8 minutes,
  which stays well below GitHub's 1,000 req/hour primary limit.

**DLQ behavior:**
- No DLQ is provisioned by default. Events are silently dropped after retry exhaustion
  unless a DLQ is configured on the EventBridge rule target.
- DLQ (SQS standard queue only — not FIFO) must be explicitly set on the
  `aws.cloudwatch.EventTarget` resource via `deadLetterConfig`.
- DLQ messages include `ERROR_CODE`, `ERROR_MESSAGE`, `RETRY_ATTEMPTS`,
  `TARGET_ARN`, and `RULE_ARN` attributes for diagnosis.
- Errors that bypass retries entirely (dropped immediately to DLQ, no retries):
  missing IAM permissions, invalid endpoint DNS, resource-not-found. A misconfigured
  GitHub PAT secret ARN or wrong endpoint URL falls into this category.

**Failure scenario analysis for M4:**

| Scenario | Frequency | EventBridge handles it? |
|---|---|---|
| GitHub transient 5xx | Rare | ✓ retried automatically |
| GitHub 429 (secondary rate limit burst) | Very rare for KEV volume | ✓ retried; 185 attempts >> typical 60s cooldown |
| GitHub PAT expired / wrong permissions | Operational failure | ✗ dropped immediately; DLQ catches it |
| EventBridge rule missing invoke permissions on API destination | Misconfiguration | ✗ dropped immediately; DLQ catches it |
| Sustained GitHub outage >24 hours | Incident | ✗ dropped after retry window; DLQ catches it |

**Conclusion:** AWS-native retry (24hr, 185 attempts, exponential backoff) is sufficient
for the primary failure modes at expected KEV event volume. The operational failures
(expired PAT, IAM misconfiguration) are not retryable regardless — they need a DLQ to
surface.

### Recommendation

**Hulumi should NOT ship a custom DLQ pattern as a mandatory M4 default.** The
AWS-native retry semantics handle transient GitHub rate limiting without additional
infrastructure.

However, `ContainerImageRebuildTrigger` **should expose an optional `deadLetterQueue`
prop** (type: `aws.sqs.Queue | undefined`). When set, the component wires it to the
`aws.cloudwatch.EventTarget` `deadLetterConfig`. Default: `undefined` (no DLQ) for
Sandbox; Hulumi should emit a warning (`pulumi.log.warn`) at StartupHardened if no DLQ
is configured, since a silently dropped KEV dispatch is a security regression. Document
the DLQ option in the M4 cookbook with a reference SQS queue + CloudWatch alarm pattern
(consumer-supplied, not Hulumi-shipped).

This keeps the component surface minimal while making the failure mode visible at the
tier where it matters most.

---

## Question 4

**`AsgInstanceRefresh.triggerOnAmiBump` mechanism** — should it be a Pulumi
`Output<string>` chain (tightest coupling) or an EventBridge rule on
`imagebuilder.amazonaws.com` events (more decoupled)? Recommend with justification.

### Sources

- `docs/slo/idea/hulumi-for-operations-v1-3.md` — Q4 framing, "Default decision: `Output<string>` chain"
- Pulumi resource model documentation (Output lifecycle and `dependsOn` behaviour)
- AWS EC2 Image Builder event reference: `IMAGE_STATE_CHANGED` with state `AVAILABLE`
- AWS ASG `StartInstanceRefresh` API semantics

### Findings

**Option A — Pulumi `Output<string>` chain:**

```typescript
const pipeline = new Ec2GoldenAmiPipeline("pipeline", { ... });
const refresh = new AsgInstanceRefresh("refresh", {
  asgName: asg.name,
  triggerOnAmiBump: pipeline.latestAmiId,  // Output<string>
});
```

`latestAmiId` is the Pulumi Output from `Ec2GoldenAmiPipeline` that resolves to the
Image Builder pipeline's most-recently-distributed AMI ID. When `latestAmiId` changes
on a `pulumi up`, Pulumi sees the dependency and marks `AsgInstanceRefresh` as needing
an update, triggering the instance refresh.

**Strengths:**
- Idiomatic Pulumi — the dependency is in the stack graph, visible in `pulumi preview`
- Type-safe — no additional EventBridge rule resource per pipeline
- Deterministic ordering: the AMI is guaranteed distributed before the refresh starts
  (Output resolution enforces sequencing within the same deployment)
- No runtime infrastructure beyond what M2 and M3 ship

**Weaknesses:**
- `latestAmiId` in Pulumi state only updates when `pulumi up` runs. Image Builder
  pipelines that run on a schedule (daily cron, or KEV-triggered) run independently of
  Pulumi. After the Image Builder pipeline completes, the ASG will NOT automatically
  refresh — a `pulumi up` is required to pick up the new AMI ID and trigger the refresh.
- This means automated, hands-off daily refresh requires the consumer to integrate
  `pulumi up` into their post-Image-Builder-pipeline CI step (or use Pulumi Automation
  API). This is a documentation burden, not a code burden.

**Option B — EventBridge rule on `imagebuilder.amazonaws.com` `IMAGE_STATE_CHANGED`:**

EC2 Image Builder emits an `IMAGE_STATE_CHANGED` event to the default EventBridge bus
when a pipeline run completes with state `AVAILABLE`. An EventBridge rule can match
this and invoke a target that calls `StartInstanceRefresh`.

**Strengths:**
- Fully decoupled — refresh happens automatically when Image Builder completes,
  regardless of whether `pulumi up` runs
- Works for KEV-triggered out-of-cadence rebuilds without any CI involvement

**Weaknesses:**
- The EventBridge rule's _target_ must call the ASG `StartInstanceRefresh` API. This
  requires either: (a) a Lambda, (b) Step Functions Express, or (c) EventBridge → API
  Gateway → ASG API call chain. Options (a) and (b) violate the v1.3 "no Hulumi-shipped
  Lambda" constraint. Option (c) adds significant infrastructure complexity.
- EC2 Image Builder's `IMAGE_STATE_CHANGED` event does not carry the ASG name — the
  EventBridge rule target would need to derive which ASG(s) to refresh from the AMI
  tags, requiring a lookup (another Lambda). This defeats the no-Lambda constraint.
- Adds one EventBridge rule + one IAM role per pipeline, increasing resource count and
  blast radius.

**Decision matrix:**

| Criterion | `Output<string>` chain | EventBridge rule |
|---|---|---|
| No-Lambda constraint | ✓ | ✗ (needs Lambda for ASG lookup) |
| Automated daily refresh (no pulumi up) | ✗ (needs CI integration) | ✓ |
| Plan-time visibility in `pulumi preview` | ✓ | ✗ |
| Resource overhead | Zero (dependency only) | 1 rule + 1 IAM role per pipeline |
| Consistent with Hulumi component model | ✓ | ✗ (runtime orchestration) |

### Recommendation

**Use `Output<string>` chain as the v1.3 default.** The no-Lambda constraint rules out
the EventBridge rule approach for v1.3 without introducing significant infrastructure
complexity. The `Output<string>` chain is idiomatic Pulumi, type-safe, and consistent
with the principle that "Hulumi codifies IaC defaults; runtime orchestration is the
consumer's."

The documentation gap (consumer must run `pulumi up` after Image Builder pipeline
completes to trigger refresh) is resolved by shipping a reference GitHub Actions
workflow snippet in the M3 cookbook: `post-image-builder-pulumi-up.yml` shows how to
subscribe to the Image Builder `IMAGE_STATE_CHANGED` EventBridge event via GitHub
Actions OIDC + Pulumi's GitHub Action, triggering a non-interactive `pulumi up`.

Reserve the EventBridge rule approach as a **v1.4 opt-in** for consumers who explicitly
need automated refresh without CI involvement (aligns with the idea doc's framing).

---

## Approach recommendation

**Approach B (full — image pipeline + ASG refresh + container-image rebuild trigger)
is confirmed. No revision required.**

Research against all four open questions returned no blocking unknowns:

1. **Q1 ✓** — `EventApiDestination` + `InputTransformer` fully supports injecting
   `{cve_id, ecr_image_digest, severity, kev_added_date}` into `client_payload`.
   No Lambda required. Minor caveat: document `kev_added_date` provenance and add an
   event-pattern filter to prevent multi-finding batches from silently truncating.

2. **Q2 ✓** — Daily AMI rebuild + 3 distribution targets costs ~$6-7/month for a
   startup fleet in eu-west-2 — affordable at both Sandbox (weekly) and
   StartupHardened (daily) tiers. Condition: ship a 7-day lifecycle policy as the
   component default.

3. **Q3 ✓** — AWS-native retry (24hr, 185 attempts) is sufficient for the expected
   low-volume KEV dispatch workload. Ship `deadLetterQueue` as an opt-in prop;
   emit a `pulumi.log.warn` at StartupHardened when no DLQ is configured.

4. **Q4 ✓** — `Output<string>` chain is the correct v1.3 default. Document the
   `pulumi up` post-pipeline CI integration in the M3 cookbook. EventBridge rule
   deferred to v1.4.

**Revised action items for the v1.3 design doc (from Q1–Q4 findings):**

- `Ec2GoldenAmiPipeline`: enforce 7-day lifecycle policy as component default (Q2)
- `ContainerImageRebuildTrigger`: add event-pattern filter for single-finding CRITICAL
  events; add `deadLetterQueue?: aws.sqs.Queue` prop; add JSDoc on `kev_added_date`
  provenance (Q1, Q3)
- `AsgInstanceRefresh`: ship M3 cookbook section `post-image-builder-pulumi-up.yml`;
  document v1.4 EventBridge rule opt-in (Q4)

These are additive spec refinements, not scope changes. Approach B milestone shape
(M1 EcrPullThroughCache → M2 Ec2GoldenAmiPipeline → M3 AsgInstanceRefresh → M4
ContainerImageRebuildTrigger → M5 threat-model scenarios + v1.3.0 release) stands
unchanged.
