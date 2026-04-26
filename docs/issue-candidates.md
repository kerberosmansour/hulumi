---
title: Issue candidates from lessons-learned
description: A running list of follow-ups noticed across milestone retros that look ready to become GitHub issues. Format is copy-paste-friendly.
---

# Issue candidates from lessons-learned

This doc is a working backlog — patterns, gaps, and small follow-ups noticed during the v0.x → v1.0 milestones (and during the v1.0 documentation pass) that are _not_ tracked anywhere else and look like good first issues or v1.1+ candidates.

Each entry is formatted so you can paste it into a new GitHub issue with minimal editing. Source(s) for each candidate is cited so you can verify the context before filing.

When you file one, please:

1. Strike through the entry here (or remove and link the GH issue) so the doc stays a working list, not a parallel tracker.
2. Tag the issue with the suggested labels.
3. If you're filing several at once, prefer one issue per atomic concern over a single mega-issue — Hulumi's milestones have shown atomic units close faster.

## Filed status (2026-04-25)

All 20 candidates below have been filed as GitHub issues #15–#34. The `v1.1` milestone (#1 in `gh api`) groups items #18 and #29 (candidates §4 and §15). Each entry retains its original text plus a **Filed as** pointer.

| Candidate | Issue                                                      | Candidate | Issue                                                      |
| --------- | ---------------------------------------------------------- | --------- | ---------------------------------------------------------- |
| §1        | [#15](https://github.com/kerberosmansour/hulumi/issues/15) | §11       | [#25](https://github.com/kerberosmansour/hulumi/issues/25) |
| §2        | [#16](https://github.com/kerberosmansour/hulumi/issues/16) | §12       | [#26](https://github.com/kerberosmansour/hulumi/issues/26) |
| §3        | [#17](https://github.com/kerberosmansour/hulumi/issues/17) | §13       | [#27](https://github.com/kerberosmansour/hulumi/issues/27) |
| §4        | [#18](https://github.com/kerberosmansour/hulumi/issues/18) | §14       | [#28](https://github.com/kerberosmansour/hulumi/issues/28) |
| §5        | [#19](https://github.com/kerberosmansour/hulumi/issues/19) | §15       | [#29](https://github.com/kerberosmansour/hulumi/issues/29) |
| §6        | [#20](https://github.com/kerberosmansour/hulumi/issues/20) | §16       | [#30](https://github.com/kerberosmansour/hulumi/issues/30) |
| §7        | [#21](https://github.com/kerberosmansour/hulumi/issues/21) | §17       | [#31](https://github.com/kerberosmansour/hulumi/issues/31) |
| §8        | [#22](https://github.com/kerberosmansour/hulumi/issues/22) | §18       | [#32](https://github.com/kerberosmansour/hulumi/issues/32) |
| §9        | [#23](https://github.com/kerberosmansour/hulumi/issues/23) | §19       | [#33](https://github.com/kerberosmansour/hulumi/issues/33) |
| §10       | [#24](https://github.com/kerberosmansour/hulumi/issues/24) | §20       | [#34](https://github.com/kerberosmansour/hulumi/issues/34) |

---

## Documentation gaps

### 1. Skill scenario JSONs still say "v0.4+" for components that have shipped

**Title**: `chore(skill): sweep "v0.x+" forward-references in scenario JSONs now that v1.0 has shipped`
**Labels**: `skill`, `documentation`, `good first issue`
**Source**: [docs/lessons/hulumi-m4.md](./lessons/hulumi-m4.md) line 14; observed in this doc pass.

The M1 skill ships scenario JSONs with forward-references like `"available in Hulumi v0.4+"`. Per-milestone passes flip these to `"Shipped in M<N>"` once the component lands. At v1.0, almost everything has shipped, but a sweep across all five `skills/hulumi-threat-model/scenarios/*.json` files would catch any remaining stragglers. The output schema is locked, so this is a string-only edit.

**Acceptance**:

- Every scenario JSON's `recommendedComponents[].availability` field reads `Shipped in M<N>` (no `v0.x+` strings remain).
- `skills/hulumi-threat-model/tests/schema.test.ts` and `hulumi-threat-model.test.ts` pass.

---

### 2. Demo-gate sanity check before npm publish

**Title**: `chore(skill): add a manual demo-gate checklist for fresh Claude Code session install + invoke`
**Labels**: `skill`, `release`, `documentation`
**Source**: [docs/lessons/hulumi-m1.md](./lessons/hulumi-m1.md) lines 49–50.

The M1 verify report flagged that "install the skill into `~/.claude/skills/hulumi-threat-model/` and invoke in a fresh Claude Code session" was never exercised end-to-end — direct CLI invocation hits the same entry points but the full agent-side path is uncovered. Add a `docs/release-checklist.md` with manual-gate items the maintainer should run before tagging a release. (Automating this would require a Claude Code harness in CI; out of scope for now.)

**Acceptance**:

- `docs/release-checklist.md` exists and is referenced from `docs/development.md § Releasing`.
- The checklist includes the install-and-invoke-in-fresh-session step + a CLI smoke + `gh attestation verify` for each tarball.

---

### 3. Standalone "FAQ" / common confusion doc

**Title**: `docs: extract recurring "common gotchas" from lessons into a top-level FAQ`
**Labels**: `documentation`, `good first issue`
**Source**: This doc pass; the same gotchas appear across [docs/lessons/](./lessons/) and [docs/development.md § Common gotchas](./development.md#common-gotchas).

Several confusions recur across milestones — Pulumi's mock async behaviour, the one-PolicyPack-per-process limit, vitest's `pulumi.dynamic.Resource` clash, prettier eating markdown placeholders, the H3 advisory→mandatory transition. They're listed in [development.md](./development.md) but a top-level FAQ in `docs/faq.md` would help non-contributors who hit one of them mid-cookbook.

**Acceptance**:

- `docs/faq.md` exists with at least the six gotchas above.
- Linked from `docs/README.md` and the relevant cookbooks' Troubleshooting sections.

---

## Drift classifier follow-ups

### 4. Emit `Mixed` DriftSource when multiple adapters report drift

**Title**: `feat(drift): support Mixed DriftSource when multiple adapters concurrently report drift`
**Labels**: `drift`, `enhancement`, `tla-relevant`
**Source**: [docs/lessons/hulumi-m4.md](./lessons/hulumi-m4.md) line 61.

The TLA+ spec allows `Mixed` as a `DriftSource`. The current `hardenedVerdict()` doesn't emit it; it would surface when MULTIPLE adapters report drift simultaneously (e.g., a console event AND a provider bump in the same window). The verdict matrix would need a sixth row, the BDD test extended, and the trace markdown updated upstream first.

**Acceptance**:

- `Mixed` is added to `DriftSource` in [packages/drift/src/verdict.ts](../packages/drift/src/verdict.ts).
- Verdict matrix BDD covers the new row.
- TLA+ alignment meta-test still passes (the trace upstream needs updating in lockstep).

---

### 5. Bounded-retry budget for CloudTrail lookups

**Title**: `feat(drift): add bounded retry to CloudTrailAdapter with budget-bounded test`
**Labels**: `drift`, `enhancement`, `reliability`
**Source**: [docs/lessons/hulumi-m4.md](./lessons/hulumi-m4.md) line 62.

The current `CloudTrailAdapter` doesn't retry on failure. The contract forbids retry-on-failure exceeding the probe timeout — a bounded retry budget (say, 3 attempts with exponential backoff capped at `probeTimeoutMs / 4`) would handle transient `LookupEvents` throttling without changing the verdict semantics. A test should assert the budget bound (no infinite loop, no exceed of `probeTimeoutMs`).

**Acceptance**:

- `CloudTrailAdapter` accepts an optional `retry: { attempts, backoffMs }` config.
- New `tests/cloudtrail-retry-budget.test.ts` asserts the bound.
- Existing tests unaffected.

---

### 6. Region-aware default for `probeTimeoutMs`

**Title**: `feat(drift): make probeTimeoutMs default region-aware (CloudTrail delivery latency varies)`
**Labels**: `drift`, `enhancement`
**Source**: [docs/components/drift-classifier.md](./components/drift-classifier.md); [docs/cookbooks/drift-detection.md § Troubleshooting](./cookbooks/drift-detection.md#troubleshooting).

CloudTrail event-delivery latency is documented as "typically <15 minutes" but observed to spike past 60s in certain regions during heavy load. The current 60s default works for `us-east-1` most of the time, but a region-aware default (e.g. `us-east-1: 60s, ap-southeast-3: 120s`) would reduce false-positive `Unknown / low` verdicts.

**Acceptance**:

- `probeTimeoutMs` default is computed from the AWS region passed via `AWS_REGION` env var or adapter config.
- Default region table is documented in `docs/components/drift-classifier.md`.
- Existing tests still pass with the explicit `probeTimeoutMs` override.

---

### 7. Real-AWS integration test bodies (drift)

**Title**: `test(drift): fill in tests/integration/drift-classify.integration.test.ts now that PULUMI_ACCESS_TOKEN is set`
**Labels**: `drift`, `integration-test`, `requires-token`
**Source**: [docs/lessons/hulumi-m4.md](./lessons/hulumi-m4.md) line 60.

The integration test placeholder at `packages/drift/tests/integration/drift-classify.integration.test.ts` only asserts `HULUMI_INTEGRATION=1`. The actual test body lands when `PULUMI_ACCESS_TOKEN` is configured (M3 deferral, same gating as the baseline integration tests). Body should: classify a known-drifted resource, assert verdict, assert cache hit on second call.

**Acceptance**:

- Test body exercises the full real-AWS classification path against the sandbox account.
- Skipped by default unless `HULUMI_INTEGRATION=1`.
- Documented in [docs/integration-testing.md](./integration-testing.md) cost contract row.

---

## Baseline / policies follow-ups

### 8. Migrate from `BucketV2` to non-V2 names (v2.0 candidate)

**Title**: `chore(baseline): plan v2.0 migration from BucketV2 to non-V2 @pulumi/aws names`
**Labels**: `baseline`, `breaking-change`, `v2.0`
**Source**: [docs/lessons/hulumi-m2.md](./lessons/hulumi-m2.md) line 41; [CHANGELOG.md § Deprecated](../CHANGELOG.md).

`@pulumi/aws@7.x` deprecates `BucketV2`, `BucketServerSideEncryptionConfigurationV2`, `BucketVersioningV2`, `BucketObjectLockConfigurationV2`, `BucketLoggingV2` in favour of the non-V2 names. `interfaces.md §1` locks `SecureBucketOutputs.bucket` to `aws.s3.BucketV2` for v1.x. v2.0 needs to either migrate to non-V2 names (breaking), keep V2 (carries deprecation warnings), or update interfaces.md to use both. Open as a design issue, not a code change.

**Acceptance**:

- Issue describes the three options with tradeoffs.
- Decision recorded in `docs/components/secure-bucket.md § Planned deltas` once made.
- Tagged `v2.0` for milestone planning.

---

### 9. Single-account bootstrap paradox: KMS deny-without-tag policy

**Title**: `feat(baseline): support KMS deny-without-tag in single-account stacks via two-phase apply`
**Labels**: `baseline`, `enhancement`, `aws`
**Source**: [docs/components/account-foundation.md](./components/account-foundation.md) lines 64–66.

Today the KMS deny-without-tag policy attaches only when `orgAccountIds` is supplied — there's a real bootstrap paradox in single-account stacks where the policy itself prevents the principal from updating the policy. A two-phase apply (apply CMKs first, apply policy second with explicit `dependsOn` on the IaC role being tagged) would let single-account users opt in. Probably wants a feature flag.

**Acceptance**:

- `AccountFoundation` accepts `kmsDenyWithoutTag: "auto" | "force" | "off"` (default `"auto"`).
- `"force"` applies the deny policy in single-account stacks; documented bootstrap recovery if it locks the principal out.
- Test exercises the new modes under mocks.

---

### 10. Real-AWS integration test bodies (account-foundation)

**Title**: `test(baseline): fill in tests/integration/account-foundation.integration.test.ts`
**Labels**: `baseline`, `integration-test`, `requires-token`
**Source**: [docs/lessons/hulumi-m3.md](./lessons/hulumi-m3.md) (referenced in lessons); [docs/integration-testing.md](./integration-testing.md).

Same shape as #7 but for `@hulumi/baseline.AccountFoundation`. The placeholder body asserts `HULUMI_INTEGRATION=1`. Real body should: deploy Sandbox + Startup-Hardened stacks, assert detector / trail / config-recorder ARNs are reachable, destroy cleanly, assert no orphaned KMS keys.

**Acceptance**:

- Test body deploys + asserts + destroys against the sandbox account.
- Documented in [docs/integration-testing.md](./integration-testing.md).
- Cost remains within the documented `<$1/run` budget.

---

## Tooling / repo hygiene

### 11. Reusable forbidden-shortcut lint helper

**Title**: `chore(tests): extract reusable forbidden-shortcut lint helper`
**Labels**: `tooling`, `tests`, `good first issue`
**Source**: [docs/lessons/hulumi-m4.md](./lessons/hulumi-m4.md) line 78.

The "scan src/ for forbidden symbol references" pattern is repeated across M3 (`no-sleep.test.ts`) and M4 (`no-shell-exec.test.ts`). Both walk the package src tree, strip comments, and grep for a deny-list. Extract into a `tests/_utils/forbidden-shortcut.ts` helper that takes `(dir, denyPatterns, excludePaths)` and returns a vitest-compatible matcher. Refactor both call sites.

**Acceptance**:

- `tests/_utils/forbidden-shortcut.ts` exists with the helper API.
- `no-sleep.test.ts` and `no-shell-exec.test.ts` use it.
- Behaviour unchanged (both tests still green; comment-stripping still works).

---

### 12. Cooling-off self-test against synthetic lockfile diffs

**Title**: `test(scripts): exercise cooling-off-diff.mjs against synthetic lockfile fixtures`
**Labels**: `tooling`, `tests`, `release`
**Source**: [docs/lessons/hulumi-m5.md](./lessons/hulumi-m5.md) line 63.

`scripts/cooling-off-diff.mjs` (M5) handles fresh-bump-fail and stale-bump-pass via live-registry hits. There's no automated test exercising it with synthetic lockfile fixtures. The `tests/skill-bdd/`-style fixture directory pattern would work — feed in a synthetic `pnpm-lock.yaml` diff and assert the script's exit code without hitting npm.

**Acceptance**:

- `scripts/tests/cooling-off-diff.test.mjs` exercises 4+ fixture scenarios (fresh-major, fresh-minor, fresh-patch, stale, malformed).
- Tests run in CI's `lint` job.

---

### 13. Extend exact-pin-guard to cover GitHub Actions reusable workflows

**Title**: `chore(scripts): extend pin guard to GitHub Actions reusable workflows + drift package runtime deps`
**Labels**: `tooling`, `supply-chain`, `release`
**Source**: [docs/lessons/hulumi-m4.md](./lessons/hulumi-m4.md) lines 67, 70.

`scripts/exact-pin-guard.mjs` enforces `@pulumi/*` pins. Two adjacencies it doesn't yet cover:

1. The `slsa-framework/slsa-github-generator` (and similar) reusable workflows in `.github/workflows/release.yml` — should be pinned to exact SHAs and the guard should check it. Either extend `exact-pin-guard.mjs` or add a sibling `actions-pin-guard.mjs`.
2. The drift package's runtime deps (`@aws-sdk/*`, `simple-git`, `p-timeout`) are exact-pinned in `pnpm-lock.yaml` but NOT in `exact-pin-guard.mjs`'s allowlist.

**Acceptance**:

- The guard script (or sibling) checks GitHub Actions workflow pins.
- Drift runtime deps either added to the allowlist or explicitly excluded with a documented reason in the script.
- CI step covers the extended scope.

---

### 14. Probe escape hatch (`poll.ts`) deprecation timeline

**Title**: `chore(baseline): document or remove the unused poll.ts probe escape hatch`
**Labels**: `baseline`, `cleanup`, `discuss`
**Source**: [docs/lessons/hulumi-m3.md](./lessons/hulumi-m3.md); [docs/components/account-foundation.md](./components/account-foundation.md) lines 144–146.

`packages/baseline/src/aws/probes/poll.ts` was preserved when M3 dropped the polling probe in favour of `dependsOn`. It's currently unused but kept for v1.1+ scenarios where `dependsOn` alone is insufficient. Decision needed: document a concrete v1.1 use case OR remove the file (it can come back from git history if needed). Sitting unused indefinitely is dead-weight code surface.

**Acceptance**:

- Either: an issue documents at least one concrete v1.1 use case for `poll.ts` and a target version.
- Or: `poll.ts` is removed and the no-sleep lint's exception is narrowed to delete the now-empty `probes/` allowance.

---

### 15. Verbatim-prose deny list is fragment-based, not semantic

**Title**: `chore(license-boundary): explore semantic-similarity check for license-boundary lint`
**Labels**: `tooling`, `license`, `discuss`, `v1.1`
**Source**: [docs/cookbooks/threat-modeling.md § Troubleshooting](./cookbooks/threat-modeling.md#troubleshooting); existing `scripts/license-boundary-lint.mjs`.

The IDs-only lint is fragment-based — it knows distinctive opening phrases of CCM, AICM, and CIS controls and fails on those. A cleverly paraphrased near-quote could slip through. A semantic-similarity check (embedding-based) would catch a wider class of leaks. The tradeoff is a runtime dependency on an embedding model and a higher false-positive rate.

**Acceptance**:

- Discussion issue lays out the design space (fragment-based, regex-based, embedding-based, full LLM-as-judge) with tradeoffs.
- Decision recorded; no code change required for v1.x unless the discussion concludes otherwise.

---

### 16. SCP teardown CI test

**Title**: `test(deployment): automate SCP teardown verification (manual today)`
**Labels**: `deployment`, `tests`, `requires-aws-org-write`
**Source**: [docs/lessons/hulumi-m5.md](./lessons/hulumi-m5.md) line 64.

[docs/deployment/scp-guide.md](./deployment/scp-guide.md) documents the SCP revert path but doesn't test it in CI. Real teardown is a manual maintainer action; automating it would require AWS Organizations write access in the CI sandbox, which is over-scope for the current sandbox account permissions. Issue: design a scoped permission set that lets CI exercise the teardown without inheriting the full org-admin surface.

**Acceptance**:

- Issue describes the minimum-permissions IAM/OIDC role design for teardown CI.
- Maintainer decision on whether to grant or stay manual.

---

## Skill follow-ups

### 17. Skill template: distinguish in-repo vs upstream-corpus files in runbooks

**Title**: `chore(runbook-template): make the "files to read" table distinguish in-repo vs upstream-corpus paths`
**Labels**: `documentation`, `tooling`
**Source**: [docs/lessons/hulumi-m1.md](./lessons/hulumi-m1.md) line 32; same observation in M3 and M4 lessons.

Several files in M1's read-list are in the upstream TauriMobile planning corpus, not in this repo. The runbook template's "Files to read before changing anything" column is ambiguous about cross-repo locations. Add a column or convention for "repo-of-origin" so future milestones don't assume in-repo paths.

**Acceptance**:

- The runbook template (upstream `runbook-template_v_3`) is updated to add a `repo-of-origin` convention.
- Hulumi runbooks under `docs/runbook-milestones/` are NOT touched (they're frozen by milestone).

---

### 18. Standardise "integration-test stub" pattern

**Title**: `chore(tests): document the it.skip integration-test stub pattern as the official convention`
**Labels**: `documentation`, `tests`
**Source**: [docs/lessons/hulumi-m4.md](./lessons/hulumi-m4.md) line 79; used in M3 + M4.

The `it.skip`-by-default integration test stub (skipped unless `HULUMI_INTEGRATION=1`) is now used in M3 (`tests/integration/account-foundation.integration.test.ts`) and M4 (`tests/integration/drift-classify.integration.test.ts`). This is the de facto pattern for "real-AWS test that requires user-side setup before running." Document it in [docs/development.md § Testing strategy](./development.md#testing-strategy) with the canonical shape so the M5-and-beyond pattern is unambiguous.

**Acceptance**:

- `docs/development.md` has a small "Integration test stub pattern" section showing the canonical `it.skip` + env-var gate shape.
- Future integration tests follow it.

---

## Process / community

### 19. Open the v1.1+ scope as a milestone tracker

**Title**: `meta: open a v1.1+ planning milestone with the post-release scope from M5 lessons`
**Labels**: `meta`, `roadmap`
**Source**: [docs/lessons/hulumi-m5.md](./lessons/hulumi-m5.md) lines 67–68.

M5 lessons enumerate the post-v1.0 scope: `hulumi-drift` skill, `hulumi-check` skill, standalone CLI, Azure / GCP adapters, CIS v7.0 full pack, MITRE ATLAS submission, Pulumi-upstream provenance PR, BucketV2 → Bucket migration. These currently live only in the M5 lessons doc — open a v1.1+ milestone in GitHub and file each as a separate issue under it so contributors have a visible backlog.

**Acceptance**:

- A `v1.1` GitHub milestone exists.
- Each of the eight items above is filed as a separate issue under that milestone.

---

### 20. Cookbook coverage gaps

**Title**: `docs(cookbooks): add cookbooks for migration scenarios (Terraform→Pulumi+Hulumi, mid-stack adoption)`
**Labels**: `documentation`, `good first issue`
**Source**: This doc pass; current cookbooks at [docs/cookbooks/](./cookbooks/).

The v1.0 cookbook set covers greenfield adoption (`account-bootstrap`, `getting-started`), the policy pack (`policy-pack-rollout`, `suppressions`), drift (`drift-detection`), threat modeling, and provenance verification. Missing cookbooks I'd expect users to ask for:

- "How do I import existing AWS resources into a `SecureBucket` / `AccountFoundation`-managed stack?"
- "How do I migrate from a Terraform module that handles bucket hardening?"
- "How do I run Hulumi in a Pulumi monorepo alongside non-Hulumi stacks?"
- "How do I write my own Hulumi component (using `SecureBucket` as a template)?"

**Acceptance**:

- One PR per cookbook, following the template in [docs/cookbooks/README.md § Recipe template](./cookbooks/README.md#recipe-template).
- Each cookbook links from the cookbooks index.

---

---

## Kubernetes / EKS surface candidates (filed 2026-04-26 from a real-world `sg-unified` M7 deployment)

Issues #38–#45 were filed against this repo on 2026-04-26 by a Hulumi consumer who burned a meaningful slice of an EKS+Istio milestone (`sg-unified` M7 phase G) on patterns that a packaged Hulumi component would have collapsed to a single invocation. This section triages them; none can be silently implemented without scoping discussion because **`@hulumi/baseline` does not yet ship a Kubernetes / EKS / Helm / Istio / RDS / Secrets-Manager surface at all** — each issue is a new component category, not a fix to existing code.

**The cross-cutting design decisions live in [`docs/design/hulumi-k8s-surface.md`](./design/hulumi-k8s-surface.md)** (authored 2026-04-26). That doc commits to the package layout, the `HardenedHelmRelease` wrapper shape, the version-pin policy, the PSA-baseline default, the mesh-choice rationale (Istio first), and the per-component API shape. Read it before opening implementation PRs against any of #38–#44.

The list also seeds a v1.x AWS-side deferral track parallel to the existing GitHub-side [`hulumi-github-v1.1-deferrals.md`](./runbook-milestones/hulumi-github-v1.1-deferrals.md). When the maintainer is ready to commit to a Kubernetes surface, fork that doc shape (trigger condition + acceptance criteria + target milestone per item) into `docs/runbook-milestones/hulumi-aws-k8s-deferrals.md`.

| Issue                                                      | Title                                                                                                     | Surface                                                                      | Triage                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#38](https://github.com/kerberosmansour/hulumi/issues/38) | EKS subnet auto-tagging for ALB Controller discovery                                                      | `@hulumi/baseline/aws` — new `eks.SubnetTagger` helper OR awsx `Vpc` wrapper | **scope-first**                 | Smallest of the eight. Pure tag-writing on existing subnets via `aws.ec2.Tag`. No new peer deps. Pulls in the broader question of whether Hulumi wraps awsx `Vpc` at all.                                                                                                                                                                                                                                                                               |
| [#39](https://github.com/kerberosmansour/hulumi/issues/39) | `MeshFoundation` — bundled hardened Istio install                                                         | `@hulumi/baseline/k8s` — new sub-package                                     | **discuss / defer**             | Three pinned Helm releases (istiod, istio-cni, ingressgateway) with PSA-baseline-clean defaults. Requires `@pulumi/kubernetes` peer dep + a stance on Helm chart pinning + decision on whether Hulumi maintains Istio version-skew compatibility matrices. Tagged `discuss` upstream. Cookbook for the underlying interaction shipped today as [`docs/cookbooks/psa-baseline-istio-sidecar.md`](./cookbooks/psa-baseline-istio-sidecar.md) (issue #45). |
| [#40](https://github.com/kerberosmansour/hulumi/issues/40) | `SecureRds` — extract RDS-managed master credential to a K8s `Secret`                                     | `@hulumi/baseline/aws` + `@hulumi/baseline/k8s` cross-package                | **discuss / defer**             | Three implementation paths (dynamic provider, in-cluster Job, Helm post-renderer) each with different trust / failure-mode trade-offs. Threat-model row needed before picking one — secret extraction across Pulumi state ↔ live cluster boundary is exactly the kind of seam that wants a written design doc.                                                                                                                                          |
| [#41](https://github.com/kerberosmansour/hulumi/issues/41) | `MeshedHttpEntrypoint` — bundled ALB Ingress + Istio `Gateway` + `VirtualService` + `AuthorizationPolicy` | `@hulumi/baseline/k8s` — new component                                       | **discuss / defer**             | Hard-depends on #39's `MeshFoundation`. The principal-name linkage between `AuthorizationPolicy` and the gateway SA is the whole reason this wants packaging — also the reason it can't be specified independently of #44 (Helm release-name stability). Tagged `discuss` upstream.                                                                                                                                                                     |
| [#42](https://github.com/kerberosmansour/hulumi/issues/42) | DaemonSet helpers should auto-add `eks.amazonaws.com/compute-type NotIn fargate` affinity                 | `@hulumi/baseline/k8s` — new helper                                          | **scope-first**                 | Mechanical injection if Hulumi ships a Helm/DaemonSet wrapper. Detection via `aws.eks.getFargateProfiles` is straightforward. Cross-cuts every K8s component below — design once.                                                                                                                                                                                                                                                                       |
| [#43](https://github.com/kerberosmansour/hulumi/issues/43) | `GitHubAppCredential` — Secrets Manager container + JWT-mint helper bundle                                | `@hulumi/baseline/aws` — new component + `scripts/`                          | **discuss / defer**             | Non-trivial JWT/RS256 plumbing in shipped bash scripts; needs decision on whether Hulumi ships executable `scripts/` artifacts (precedent: `scripts/exact-pin-guard.mjs`, `scripts/license-boundary-lint.mjs` are repo-internal, not user-facing). KMS key alias arg also wants to align with the `AccountFoundation` `kmsKeyArns` outputs.                                                                                                             |
| [#44](https://github.com/kerberosmansour/hulumi/issues/44) | Default Helm release names should drop the Pulumi-generated random suffix                                 | `@hulumi/baseline/k8s` — design constraint on the Helm wrapper               | **scope-first (cross-cutting)** | Cannot be implemented in isolation — the repo has no Helm wrapper today. Belongs to the same design as #39 / #41 / #42. Worth promoting to "decision-record" status when the K8s surface is opened, because every subsequent K8s component inherits this default. Tagged `discuss` upstream.                                                                                                                                                            |
| [#45](https://github.com/kerberosmansour/hulumi/issues/45) | docs: PSA + Istio sidecar cookbook                                                                        | `docs/cookbooks/`                                                            | **shipped 2026-04-26**          | [`docs/cookbooks/psa-baseline-istio-sidecar.md`](./cookbooks/psa-baseline-istio-sidecar.md). Cross-links #39, #41, #42.                                                                                                                                                                                                                                                                                                                                 |

### Recommended sequencing if/when the maintainer commits to a K8s surface

Sequencing committed in [`docs/design/hulumi-k8s-surface.md` § Sequencing](./design/hulumi-k8s-surface.md#sequencing-when-this-doc-is-accepted):

1. **M1** — package skeleton + `HardenedHelmRelease` + `EksSubnetTagger` (closes #38; cross-cutting #44; half-closes #42).
2. **M2** — `IstioFoundation` (closes #39).
3. **M3** — `AlbMeshedHttpEntrypoint` (closes #41).
4. **M4** — `KubernetesSecretFromAwsSecretsManager` + `RdsCredentialSecret` (closes #40); independent of M2/M3.
5. **M5** — `GitHubAppCredential` + shipped scripts (closes #43); independent track.

The package-layout decision is committed: **separate `@hulumi/k8s-baseline` package**, not a `/k8s` subpath of `@hulumi/baseline`. Rationale and trade-offs in the design doc.

### Why this isn't filed as a single epic

Each of #38–#44 has its own threat model, its own peer-dep impact, its own test surface. Bundling them masks decisions; tracking them individually preserves the discipline visible in the existing v1.0 milestones.

## How this list stays useful

- **Strike entries** (or replace with `~~original text~~ — filed as #123`) when a candidate becomes a real issue. Don't delete; the strike-through preserves context for the next reader.
- **Add new entries** as you notice them — every milestone retro generates a few. The bar is "this would be a clean GitHub issue if I had 10 minutes," not "this is a fully-scoped epic."
- **Link back** in commit messages: `Refs docs/issue-candidates.md#3` is enough.

The doc is intentionally not a spec. Treat it as a notes file the maintainer can mine when carving out backlog grooming time.
