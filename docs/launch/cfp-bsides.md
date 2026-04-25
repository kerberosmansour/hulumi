# CFP — BSides — 20-min variant

**Title**: TLA+-Verified Drift Detection for Pulumi (in 20 minutes)

**Format**: 20-minute lightning talk

**Audience**: BSides regional crowd — practitioners, students,
researchers. Mix of cloud and security backgrounds.

**Abstract** (200 words):

Drift detection in IaC is usually a hand-wavy heuristic: "did
the API call yesterday match the cloud state today?" That's not
good enough when AI agents are touching infrastructure and
human break-glass mutations happen every few minutes.

This lightning talk covers Hulumi's drift classifier — a
small, formally-verified OSS library that distinguishes
provider-API churn from console break-glass from genuine IaC
drift, using only local signals (no hosted service).

In 20 minutes:

- Live demo: 4 adapters classifying the same stack across 5 TLA+
  trace rows.
- The TLA+ spec is **150 lines**. The TypeScript classifier is
  **50 lines**. They match because a meta-test fails CI when
  they don't.
- Three load-bearing guardrails the formal model surfaced:
  `ProviderApiChurn` capped at `medium`; cache files written
  `0o600`; CloudTrail filter requires the FULL `hulumi:` tag
  namespace (bare-tag rejection).

**Takeaway**: TLA+ doesn't require a dedicated formal-methods
team. A weekend's investment maps directly to test code that
catches subtle drift in classifier logic forever.

**Bio** (30 words): [maintainer bio]

---

**Internal notes:**

- Pick a specific BSides regional chapter near the release date.
- 20-min slot demands aggressive editing — the demo IS the talk.
