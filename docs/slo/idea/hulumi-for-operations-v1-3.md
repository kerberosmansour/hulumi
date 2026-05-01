---
name: hulumi-for-operations-v1-3
created: 2026-05-01
status: ideation
tla_required: false
parent_runbook: docs/slo/completed/RUNBOOK-hulumi-operations.md
---

# Hulumi for Operations v1.3 — image-pipeline + ASG-orchestrated patching

> **Note on origin**: This doc is a **scope-revised** v1.3 plan. The user-proposed v1.3 list was: `EcrPullThroughCache + Ec2GoldenAmiPipeline + Ec2PatchWaves + KEV-aware severity escalation`. The 2026-05-01 design diffs to v1.2 absorbed `Ec2PatchWaves` (now M1 of v1.2) and `KEV-aware severity escalation` (now M2 of v1.2 via dual-route + Inspector v2 native KEV). v1.3 therefore re-fills its slate with the _next layer_ of the patching story: the **image pipeline** (so new EC2s + new container images start patched on day one) and the **ASG-orchestrated rolling refresh** (so a critical CVE rollout drains connections cleanly without dropping in-flight requests). Both directly answer Scenarios 1 and 2 from the original sunlit-guardian feedback (critical-CVE response + evergreen-deploy-already-patched).

## The pain

Sunlit (and any Hulumi consumer) lands v1.2 in production sometime in late 2026. They get **detection + scheduled patching + canary waves** — the foundation. Within a sprint, they hit two predictable gaps:

1. **A critical CVE drops on a Tuesday afternoon.** Inspector v2's KEV-route fires and pages the on-call engineer at 14:32 UTC. They have the affected instance IDs in the alert. But the next `Ec2PatchWaves` Maintenance Window doesn't fire until Sunday 02:00 UTC for the dev wave — 4 days away. The on-call has to either (a) manually run `aws ssm start-automation-execution AWS-RunPatchBaseline ...` — at which point SSM patches in place and reboots, dropping every in-flight HTTP request to that EC2 because there's no ALB drain-then-replace orchestration; or (b) wait until Sunday, accepting 4 days of exposure. Both are bad.

2. **A new EC2 is launched.** Auto Scaling Group spins up a fresh instance from the launch template. The launch template references an AMI baked 3 weeks ago, when the previous Ec2GoldenAmiPipeline run didn't exist. The new instance starts un-patched. Inspector v2 catches it within an hour and fires a CRITICAL alert. Now there are two un-patched instances in the fleet (the old one we knew about, plus this new one we just launched). The fleet drifts faster than the patch cadence catches up.

Same shape applies to **container images**. A dev pushes code Tuesday morning. CI builds a container with a base image (`FROM rust:1.88`) that resolves to the digest from 3 weeks ago. The image lands in ECR with the old base. Inspector v2 finds CVEs in the base layer the same day. Now ECR has a known-vulnerable image deployed to EKS — and there's no automatic rebuild path.

The pain compounds when an AI agent helps the consumer write the first cut. v1.2's `Ec2PatchBaseline` + `DetectiveServicesEnable` + `AuditTrail` get the consumer 70% of the way to safe patching. The remaining 30% — image pipelines + rolling refresh — is exactly the gap v1.3 fills.

## Five capabilities the user described without realizing

- Spin up a new EC2 and have it boot from an AMI that was patched in the last 7 days, automatically — no manual AMI-rotation discipline required.
- When a critical CVE drops, trigger a _rolling refresh_ of the affected Auto Scaling Group: build new AMI with the patch, instance-refresh with `MinHealthyPercentage` and ALB drain timeout, no dropped connections — even on a Tuesday afternoon, no maintenance window required.
- Pull DHI / Chainguard / Docker Hub upstream container images through a private ECR cache, signed-and-attested, so the dev's `docker pull` and CI's `docker build` go through the same auditable path — no public-internet image dependency at build time.
- Have the consumer's ECR repository auto-rebuild a container image on Inspector v2 KEV finding by triggering a GitHub `repository_dispatch` webhook — without Hulumi shipping the Lambda (the webhook is one EventBridge rule + one EventBridge API destination resource, both declarative).
- Get a `/hulumi-threat-model` scenario for the "image-pipeline-stale" failure mode that walks an AI agent through the controls before they write the first cut.

## Top risks

- **Breach** (stale-AMI drift exploit): A consumer adopts `Ec2GoldenAmiPipeline` with a default rebuild cadence of "weekly on Sunday." A new ASG launches a fresh instance Wednesday morning from the AMI baked the prior Sunday. CVE-2026-XXXXX (kernel UAF, PoC public, KEV-listed) drops Wednesday afternoon. The fresh instance is exposed for ~4 days until the next AMI rebuild + ASG refresh. **Adversary**: opportunistic worm scanning `eu-west-2` for the CVE. **Surface**: the kernel of the fresh ASG-launched EC2. **Hulumi's mitigation**: tier-aware default — Sandbox = weekly rebuild, StartupHardened = daily rebuild + KEV-trigger rebuild path. The KEV-trigger means a KEV finding from `DetectiveServicesEnable` (M2 of v1.2) routes through EventBridge to `Ec2GoldenAmiPipeline.rebuildOnKevTrigger`, kicking off an out-of-cadence rebuild + instance-refresh.
- **Compliance fine** (PCI-DSS Req 6.3.3 violation persists despite v1.2 in place): A UK fintech ships `Ec2PatchBaseline` + `Ec2PatchWaves` from v1.2 but never adopts `Ec2GoldenAmiPipeline`. Their ASG launches new EC2s from a 6-month-old AMI. The auditor pulls the SSM Patch Compliance report and finds _only_ in-place-patched instances are compliant; ASG-fresh instances drop to non-compliant within 12 hours of launch. Auditor reports "patch coverage drifts faster than the patch cadence" → PCI-DSS 6.3.3 finding. **Mitigation**: `Ec2GoldenAmiPipeline` is the v1.3 component that closes this gap; documented in cookbook + a `O_PATCH_4` policy rule (Sandbox: advisory; StartupHardened: mandatory) that requires every `aws.autoscaling.LaunchTemplate` to reference an AMI tagged `hulumi:ami-pipeline:source=Ec2GoldenAmiPipeline`.
- **Prolonged outage** (instance refresh takes the fleet down): A consumer adopts `AsgInstanceRefresh` with default `MinHealthyPercentage: 50` and a fleet of 4 EC2s behind an ALB. The instance-refresh terminates 2 instances simultaneously. Two seconds later, ALB target group reports 50% unhealthy, the remaining 2 instances absorb full traffic + immediately CPU-saturate, the ALB starts 5xx-ing. **Who notices first**: customer Slack channel within 90 seconds. **Mitigation**: Hulumi defaults `MinHealthyPercentage` to 100 (replace one at a time) — slower but safe. Tier ladder: Sandbox = 100 (slow + safe); StartupHardened = consumer-required (fail-loud — they know their fleet shape).

## Approach A — conservative (image pipeline only, manual ASG refresh)

- **Effort**: 3 person-weeks
- **Wedge week 1**: `EcrPullThroughCache` (M1) — wraps `aws.ecr.PullThroughCacheRule` for DHI / Chainguard / Docker Hub upstreams. Trivial component, ~150 lines TS.
- **Subsequent**: `Ec2GoldenAmiPipeline` (M2) wraps EC2 Image Builder for AMIs. ASG refresh is manual via `aws autoscaling start-instance-refresh` — Hulumi documents the pattern in a cookbook but ships no orchestration component.
- **Risks**: under-delivers on Scenario 1 (critical-CVE-safe-rollout). Manual `aws autoscaling start-instance-refresh` is a one-line CLI but consumers will get the `MinHealthyPercentage` default wrong. Doesn't solve the drain-before-reboot problem.

## Approach B — full image pipeline + ASG orchestration

- **Effort**: 5 person-weeks (5 milestones — within `/slo-plan` cap)
- **Wedge**: same as A, plus `AsgInstanceRefresh` (M3) — wraps the ASG instance-refresh API with safe defaults (MinHealthyPercentage 100 at Sandbox; consumer-required at StartupHardened), ALB drain timeout, max-1-instance-at-a-time, and a `triggerOnAmiBump` knob that auto-triggers refresh when `Ec2GoldenAmiPipeline` distributes a new AMI.
- M4 ships **`ContainerImageRebuildTrigger`** — declarative EventBridge rule + API destination + IAM role that POSTs a GitHub `repository_dispatch` payload when Inspector v2 fires a KEV finding for an ECR image tagged `hulumi:source-repo=<org>/<repo>`. **No Hulumi-shipped Lambda** — `aws.cloudwatch.EventApiDestination` does the HTTP POST natively. Consumer's GitHub Actions catches the dispatch and rebuilds.
- M5 ships three new `/hulumi-threat-model` scenarios + the v1.3.0 atomic four-package release.
- **Risks**: largest scope; the `ContainerImageRebuildTrigger` GitHub PAT/App auth is the crux — consumer-supplied via `aws.secretsmanager.Secret` reference, which adds a documentation burden. The `AsgInstanceRefresh.triggerOnAmiBump` cross-component wire requires careful `dependsOn` discipline.

## Approach C — local / desktop (cookbook-only, no components)

- **Effort**: 1 person-week
- **Wedge**: ship four cookbooks (`ecr-pull-through-cache.md`, `ec2-golden-ami-pipeline.md`, `asg-instance-refresh-safe-defaults.md`, `container-image-rebuild-on-kev.md`). Each cookbook contains the Pulumi snippet a consumer copy-pastes. No new components.
- **Risks**: leaves ~600 lines of Pulumi to copy-paste per consumer; defeats the "Hulumi components codify the right defaults" discipline. Approach C is the v1.4 fallback if v1.3 budget collapses.

## Recommendation

**Approach B**, with the same hard scope contract pinned in v1.2's runbook Rule 0: **Hulumi codifies _time-based_ defaults as IaC. The consumer's _findings triage_ and _runtime orchestration_ are theirs.** The line between "infra pipeline" (in scope) and "orchestration runtime" (out of scope) holds — `AsgInstanceRefresh` wraps an existing AWS-managed orchestration (ASG instance-refresh API), not a Hulumi-authored runtime. `ContainerImageRebuildTrigger` uses `aws.cloudwatch.EventApiDestination` (declarative HTTP POST), not a Lambda.

The five-milestone shape:

| M   | Surface                                                                                                                                            | Closes / answers                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| M1  | `EcrPullThroughCache` (DHI + Chainguard + Docker Hub upstreams + auth)                                                                             | Hardened-base-images cookbook from v1.2 M5                             |
| M2  | `Ec2GoldenAmiPipeline` (EC2 Image Builder wrapper + tier-aware rebuild cadence + KEV-trigger path)                                                 | Scenario 2 (evergreen — new EC2 starts patched)                        |
| M3  | `AsgInstanceRefresh` (safe defaults + ALB drain + `triggerOnAmiBump`)                                                                              | Scenario 1 (critical-CVE-safe-rollout)                                 |
| M4  | `ContainerImageRebuildTrigger` (declarative EventBridge → GitHub `repository_dispatch`) + `O_PATCH_4` policy rule                                  | Container-loop sub-piece (M5 cookbook from v1.2 promoted to component) |
| M5  | Three new `/hulumi-threat-model` scenarios (`aws-stale-ami-drift`, `asg-refresh-saturation`, `container-image-stale-base`) + atomic v1.3.0 release | v1.3 launch                                                            |

This shape — components in M1–M4, skill scenarios + release in M5 — mirrors v1.2's pattern. No new milestone discipline needed.

The **dev-laptop loop pieces from the original sunlit thread** (Renovate config for FROM-digest pinning, devcontainer integration) stay in **cookbook-only** form per Rule 0 — they're repo-level developer ergonomics, not IaC. Hulumi ships sample `renovate.json5` snippets in the v1.2 M5 hardened-base-images cookbook (already on the M5 list).

## Open questions for `/slo-research`

1. **`aws.cloudwatch.EventApiDestination` payload customization** — how flexible is the JSON payload template the API destination sends to GitHub? Specifically: can it inject the Inspector finding's CVE ID and ECR image digest into the dispatch payload's `client_payload` field? This shapes M4's surface.
2. **EC2 Image Builder cost at sunlit-shape fleet** — published as $X.XX per build minute; expected monthly cost for a daily AMI rebuild + 3 distribution targets across `eu-west-2` is what number? Verifies the StartupHardened daily-rebuild default is affordable for solo developers.
3. **GitHub `repository_dispatch` rate limits + retry semantics** — when the API destination POSTs, does GitHub's rate limit response (429 / 403) propagate back to the EventBridge rule? Does Hulumi need to ship a dead-letter SNS subscription pattern for failed dispatches, or is API destination's built-in retry sufficient?
4. **`AsgInstanceRefresh.triggerOnAmiBump` mechanism** — is the cross-component trigger a Pulumi `Output<string>` chain (clean) or an EventBridge rule on `imagebuilder.amazonaws.com` events (more decoupled, but adds an EventBridge rule per pipeline)? Default decision: `Output<string>` chain for tightest coupling; EventBridge rule as a v1.4 opt-in if consumers want a webhook surface.

## Out-of-scope-but-tracked: dev-laptop loop

The original sunlit thread's "container/dev-laptop loop is a separate beast" framing holds. v1.3 ships:

- v1.2 M5's `hardened-base-images.md` cookbook covers laptop ergonomics (Renovate, devcontainers, FROM-digest pinning).
- v1.3 M4's `ContainerImageRebuildTrigger` covers the _runtime_ path (KEV → CI rebuild).
- The **CI build hygiene** (Renovate auto-PR, Trivy gate in CI, SHA-pin discipline) stays in cookbook form. Hulumi does NOT ship GitHub Actions workflows or pre-commit hooks — those are repo-level concerns that don't belong in IaC.

If the dev-laptop loop turns out to need stronger Hulumi support (e.g., a `DevContainerImage` component that publishes a private DHI-derived image to ECR for the team's devcontainer setup to consume), that's v1.4 territory — not v1.3.

## Handoff

Recommended next steps, in order:

1. **`/slo-research hulumi-for-operations-v1-3`** — answer the four open questions, especially #1 (API destination payload) and #2 (EC2 Image Builder cost).
2. **`/slo-architect hulumi-for-operations-v1-3`** — produce the design record + threat model. Reuse v1.2's design-doc shape.
3. **`/slo-plan hulumi-for-operations-v1-3`** — produce `docs/slo/current/RUNBOOK-hulumi-operations-v1-3.md` (move to `docs/slo/completed/` once the last milestone closes) + per-milestone lessons / completion files under `docs/slo/lessons/` and `docs/slo/completion/`.
4. **Wait until v1.2 ships** before kicking off v1.3 implementation — v1.3 components depend on v1.2 surfaces (especially `DetectiveServicesEnable` for the KEV trigger and `Ec2PatchBaseline` for the patch-compliance metric the AMI rebuild consumes).

`/slo-tla` is N/A — no concurrent actors / distributed-state guarantees beyond Pulumi's standard apply ordering. Mirrors v1.2's decision.
