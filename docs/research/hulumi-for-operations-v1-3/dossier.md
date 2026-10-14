---
slug: hulumi-for-operations-v1-3
created: 2026-05-29
status: needs-revision
last_verified: 2026-10-14
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

### Corrected findings — 2026-10-14

The prior example mixed direct Inspector2 events with a Security Hub-style batch.
For direct `aws.inspector2` / `Inspector2 Finding`, `detail` is one finding object.
Its lower-camel paths and AWS ECR `imageHash` differ from the previous mapping.
This illustrative transform requires a validated ECR resource in position zero;
it is not a batch/cardinality validator. See the [official finding event schema](https://docs.aws.amazon.com/inspector/latest/user/eventbridge-integration.html).

```json
{
  "InputPathsMap": {
    "cve_id": "$.detail.packageVulnerabilityDetails.vulnerabilityId",
    "ecr_image_digest": "$.detail.resources[0].details.awsEcrContainerImage.imageHash",
    "severity": "$.detail.severity"
  },
  "InputTemplate": "{\"event_type\":\"inspector-vulnerability-finding\",\"client_payload\":{\"cve_id\":\"<cve_id>\",\"ecr_image_digest\":\"<ecr_image_digest>\",\"severity\":\"<severity>\"}}"
}
```

`vendorCreatedAt` concerns the vendor vulnerability database; it is not the CISA
KEV addition date. A real KEV requirement needs an authoritative catalogue join
or a separately verified enrichment source. Never synthesize `kev_added_date`
from this field. See [PackageVulnerabilityDetails](https://docs.aws.amazon.com/inspector/v2/APIReference/API_PackageVulnerabilityDetails.html).

### Recommendation

Input transformation remains a candidate. Before implementation, freeze the event
source/schema, allowed account/region/repository, required-field rejection,
resource selection and actual KEV provenance. A Security Hub batch is a separate
contract requiring its own schema and complete handling. No rule pattern using
`findings[0]` proves that an arbitrary batch contains exactly one finding. Q1 is
not fully resolved by this research; real dispatch/rejection evidence is required.

---

## Question 2

**EC2 Image Builder cost at sunlit-shape fleet** — current 2026 cost per build minute.
Monthly cost for daily AMI rebuild (~30 min/build) + 3 distribution targets in
eu-west-2. Compare vs v1.2 cost line items (Inspector v2 ~$1.26/EC2/month, Client VPN
$73/month, EKS control plane $73/month). Assess Sandbox vs StartupHardened
affordability.

### Sources

- AWS: [EC2 Image Builder pricing page](https://aws.amazon.com/image-builder/) — "No additional charge. You pay only for the AWS resources used."
- AWS: [EC2 On-Demand pricing (eu-west-2)](https://aws.amazon.com/ec2/pricing/on-demand/)
- AWS: [EBS pricing](https://aws.amazon.com/ebs/pricing/)

### Corrected findings — 2026-10-14

AWS describes Image Builder as having no additional service charge; the resources
it uses are billed. The old fixed London-region cost table was not backed by a
current region-specific quote or measured build/snapshot footprint and is removed.
It must not be treated as an approved budget. See [AWS Image Builder](https://aws.amazon.com/image-builder/).

Budget current instance/runtime, storage and incremental snapshots, regional
copies/transfer, logs, networking and associated services for the actual fleet.
A seven-day retention intent alone does not prove a storage bound or cleanup.
Image Builder lifecycle management is a dedicated policy, with scope, execution
permissions and dependency handling; it is not a retention field on distribution
configuration. See [image lifecycle policies](https://docs.aws.amazon.com/imagebuilder/latest/userguide/manage-image-lifecycles.html).

### Recommendation

Keep bounded retention as a design requirement. Obtain a current region-specific
estimate and prove lifecycle behavior on owned resources before claiming
cost/cleanup readiness. Choose cadence/instance type from that evidence rather
than the removed $6–7/month estimate. Q2 is partially answered, not fully qualified.

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

### Corrected findings — 2026-10-14

Token classes have different limits: GitHub documents the usual authenticated
user/PAT baseline as 5,000 requests/hour; `GITHUB_TOKEN` is generally 1,000/hour per
repository, with enterprise exceptions. Installation limits vary. Secondary
limits can also apply; 403/429 require inspecting headers and response context.
Do not assume every response includes `Retry-After`. See [GitHub REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api).

EventBridge API destinations retry selected status codes: 401, 407, 409, 429 and 5xx;
other 4xx, including 403, are not retried. The service reads `Retry-After`; a negative
value stops delivery retries. Its request timeout is five seconds. Thus a GitHub
403 rate-limit response is not automatically protected by native retry. See
[API destination delivery](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-api-destinations.html).

Default retry limits are 24 hours and 185 attempts. Delivery that exceeds configured
limits is lost without an appropriate recovery path. These limits do not make
permanent failures retryable. See [EventBridge retry policy](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-retry-policy.html).

### Recommendation

Reopen the delivery decision. Define permitted token authority, 403/429 handling,
retry exhaustion, duplicate/replay behavior, observable failure and recovery before
choosing a direct API destination. A DLQ/alert is a candidate recovery control,
not proof that an un-retried request is eventually delivered. Do not declare
native retry sufficient or prescribe a warning-only default without those
scenario tests. Q3 remains an implementation blocker, not a resolved assumption.

---

## Question 4

**`AsgInstanceRefresh.triggerOnAmiBump` mechanism** — should it be a Pulumi
`Output<string>` chain (tightest coupling) or an EventBridge rule on
`imagebuilder.amazonaws.com` events (more decoupled)? Recommend with justification.

### Sources

- `docs/slo/idea/hulumi-for-operations-v1-3.md` — Q4 framing, "Default decision: `Output<string>` chain"
- Pulumi resource model documentation (Output lifecycle and `dependsOn` behaviour)
- Proposed Image Builder event integration: source/shape and readiness contract still require verification
- AWS ASG `StartInstanceRefresh` API semantics

### Corrected findings — 2026-10-14

A Pulumi dependency chain is a proposed deployment-time approach, not an
implemented Hulumi capability. Scheduled Image Builder execution does not itself
run `pulumi up`. Merely resolving an `Output<string>` does not establish that an
AMI is distributed/usable, a launch template changed, or an instance refresh ran.
Those properties depend on the actual resources and provider update contracts.

The old constructor/`latestAmiId` example described APIs that do not exist in the
current published packages. Remove it as copyable implementation guidance.
Before selecting an approach, define AMI lookup/availability, launch-template and
ASG update/refresh behavior, protected post-build deployment identity, rollback
and real owned-fleet evidence. The “needs Lambda” assertion for every event-driven
alternative was not established; assess explicit service integrations rather
than declaring alternatives impossible.

### Recommendation

Retain the dependency chain as a candidate, with the post-build deployment gap
explicit. No future-version opt-in or cookbook is promised by this dossier.
Q4 requires an implemented, tested lifecycle before it can be called confirmed.

---

## Revised disposition

The May 2026 “all questions resolved/no revision” conclusion is withdrawn. Q1's
payload/KEV assumptions and Q3's delivery guarantees were incorrect; Q2's cost
and retention claims and Q4's proposed resource behavior were unqualified.
Approach B remains a candidate requiring a renewed architecture/security contract.

The proposed four components are not shipped by this correction or by the current
3.0.0 packages. Issue 204 remains open for those larger decisions and implementation.
Freeze actual schemas, authority, costs, lifecycle/recovery and owned cloud
qualification before claiming readiness. This maintenance correction changes
only the dossier and its two-file SLO ticket; no IAM/cloud deployment, dependency,
frozen runbook or published package is changed.
