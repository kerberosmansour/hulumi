# Security maintenance — 2026-10-14

SLO v4 maintenance contract. Owner: repository maintainer. Branch: `maintenance/security-refresh-2026-10-14`.
The user authorized dependency updates, security remediation, documentation, publication, and evidence-backed admin merges.

## Scope and compatibility
Update the existing dependency set; add no new production packages merely for convenience.
Retain public APIs and wire formats unless fail-closed security enforcement requires a documented migration.
Public source and release metadata; credentials remain Restricted and never enter evidence.
No live cloud infrastructure changes or destructive cleanup. Rollback: revert the maintenance merge; consumers may pin a previous version, with its documented security limitations.
No AI runtime behavior introduced. Measurement: N/A — maintenance of existing capabilities.

## Tracker
| Milestone | Status | Definition of done |
|---|---|---|
| M1 — dependencies and CI | done | Fresh audits, existing build/tests, reduced duplication, no PR code executed with privileged credentials |
| M2 — library security findings | done | Each report checked against current source; confirmed defects have failing-then-passing regressions; remaining dispositions explicit |
| M3 — release preparation and documentation | done | Versions and references coherent, tarballs validated, migration documentation current; actual merge/publication tracked in post-ship closeout |

## M1 contract
Read first: root manifests/lockfiles, CI/auto-merge/SCA/release workflows, dependency-update PR diffs, latest failed CI logs, architecture and security docs.
Allowed changes: package.json; pnpm-lock.yaml; packages/*/package.json; examples/*/package.json; tools/sca/package.json; tools/sca/package-lock.json; scripts/exact-pin-guard.mjs; tests/skill-bdd/exact-pin-guard.test.ts; .github/workflows/ci.yml; .github/workflows/dependabot-automerge.yml; .github/workflows/sca-emergency.yml; .github/workflows/release.yml; .github/workflows/sign-and-publish.yml; .github/workflows/dependency-review.yml; .github/workflows/pulumi-cooling-off.yml; .github/workflows/sca-review-loop-drill.yml; .github/workflows/sca-scope-drift.yml; .github/workflows/weekly-integration.yml; .github/workflows/drift-reconciler-cleanup.yml; .github/workflows/e2e-cleanup.yml; .github/workflows/live-validator-advisory.yml; .github/dependabot.yml; scripts/check-maintenance-workflows.py; this contract and maintenance verification/release docs.
Exemplar: existing checksum-pinned OSV installation and read-only CI checkouts.
Anti-exemplar: any privileged checkout of a dependency PR followed by install/build/test.
Controls: OWASP C2, C6, C10. Local invariants: verified artifact integrity, separate CI authority and fail-closed error handling.
Abuse scenario: a malicious dependency/action patch must require maintainer review and must never inherit a merge or release token during tests.
Bounds: presubmit checks use finite job timeouts; scheduled SCA once daily plus manual dispatch.
Forbidden shortcuts: skipping failing security gates, blanket advisory ignores, floating action tags, fake passing checks, `--no-verify`, or force pushes.
Refactoring: only behavior-preserving CI deduplication with coverage retained; library bugs belong in M2.
Static gates: typecheck, ESLint, exact-pin guard, workflow governance, dependency audit.

## Acceptance and evidence
| Scenario/check | Expected | Actual | Status |
|---|---|---|---|
| Baseline | Capture current failing state before fixes | Historical failing CI and red-before-green security regressions captured privately | pass |
| Supply chain | Known vulnerabilities remediated or explicitly assessed; lock integrity preserved | pnpm audit: zero findings in 458 dependencies; protected registry integrities independently checked; no new production package | pass |
| Privileged CI | Cannot execute arbitrary PR code or auto-merge an action update | Read-only scans/drill, no remote agent/merge credentials; 5 workflow regressions pass; actionlint passes | pass |
| Regressions | Existing security and compatibility tests pass | Full workspace passes; final review regressions pass: name 31, policy 38, actual generated-component integration 18; strict K8s 215; static gates pass | pass |
| CI cost | Remove repeated work without removing required coverage | Single workspace build/test/typecheck/lint with required-name aliases; daily bounded SCA; release build/sign isolation and scoped hidden artifact uploads | pass |
| Release preparation | Consistent packages and current migration notes | Six tarballs inspected: 3.0.0, engines, SDK caret peers, resolved internal dependencies and JS/types present | pass |

## Secure release contract
Bundles B/D as applicable: library abuse/unit tests, SCA, static gates; IaC uses generated-resource/policy tests.
No new deployed service; DAST applies only to an existing smoke service when its behavior changes.
Artifact SBOM/provenance required at release. Maintainer owns residual findings, with precise reason and review date.
Detected Work Ledger: Codex Security findings captured privately; every finding receives fix_now, accepted_risk, operator_action, or upstream_feedback with evidence before closure.

M1 allow-list refinement: packages/k8s-baseline/tests/release-readiness.test.ts; tests/skill-bdd/sca-track-a-contract.test.ts — replace stale exact-version/privileged-automation expectations with the current secure release and read-only scan contract; Vite is pinned as an existing test-runner peer, not a new runtime library.

## M2 contract — Hulumi confirmed findings
Read the current reported paths and their callers/tests before edits. Allowed source files: .github/dependabot.yml; .github/workflows/ci.yml; .github/workflows/dependabot-automerge.yml; .github/workflows/e2e-cleanup.yml; .github/workflows/sca-emergency.yml; .github/workflows/weekly-integration.yml; CHANGELOG.md; SECURITY.md; docs/components/workflow-governance-linter.md; docs/deployment/sandbox-account.md; docs/deployment/weekly-integration-iam-policy.json; docs/release-checklist.md; docs/release/v1.4.0-security-advisories.md; docs/release/v2.0.0-release-notes.md; docs/slo/lessons/hulumi-m3.md; package.json; packages/baseline/src/aws/account-foundation.args.ts; packages/baseline/src/aws/account-foundation.ts; packages/baseline/src/aws/cloudtrail.ts; packages/baseline/src/aws/config.ts; packages/baseline/src/aws/secure-bucket.args.ts; packages/baseline/src/aws/secure-bucket.ts; packages/baseline/tests/account-foundation.test.ts; packages/baseline/tests/integration/account-foundation.integration.test.ts; packages/cloudflare-baseline/src/public-hostname.args.ts; packages/cloudflare-baseline/src/public-hostname.ts; packages/drift/src/adapters/cloudtrail.ts; packages/drift/src/adapters/cloudwatch-log-group.ts; packages/drift/src/reconciler.ts; packages/drift/tests/no-shell-exec.test.ts; packages/k8s-baseline/scripts/populate-github-app-secret.sh; packages/platform-patterns/src/brokered-aurora-postgres-boundary.ts; packages/platform-patterns/src/workload-capability-issuer-boundary.ts; packages/policies/package.json; packages/policies/src/aws/hulumi-hardening-pack.ts; packages/policies/src/aws/packs/hulumi-hardening.ts; packages/policies/src/platform/brokered-postgres-boundary-pack.ts; packages/policies/src/platform/origin-bypass-pack.ts; pnpm-lock.yaml; scripts/exact-pin-guard.mjs; scripts/workflow-governance-lint.mjs; skills/hulumi-threat-model/scripts/generate-threat-model.mjs; tests/_utils/forbidden-shortcut.ts. Matching regression files under each affected package's tests and tests/skill-bdd; affected component/deployment docs and this contract.
Public exports and existing input/wire formats stay stable except security-tightening changes documented in the release migration. No cloud apply or production cleanup.
Invariants: inert components cannot create protected Pods; IAM GitHub trusts require a nonempty exact subject; deletion uses the actual client's account/region/credentials; audit retention survives hardened deployment; secret default configuration remains valid JSON; retry attempts are finite; lint cannot skip malicious code after URL literals or silently skip unknown environments.
Tests precede fixes. Existing generated-resource and policy tests are exemplars. Anti-exemplars: trust derived from attacker-controlled labels, allow-all DNS peers, identity caches that outlive credential refresh, regex comment stripping, blanket linter waivers. No new production dependency is needed.
Validate build/typecheck/lint, each targeted regression, workspace tests, SCA, workflow governance and release artifacts. IaC tests use isolated Pulumi mocks; live cloud validation is only claimed if executed.

M2 refinements within the requested hardening scope: tests/skill-bdd/tsconfig.json includes the shared source-scanner regression; component-to-policy admission integration compares rendered output rather than a hand-authored legacy fixture; hardened CloudTrail uses a separate 365-day COMPLIANCE archive and a real SSE-S3 access-log destination while preserving Config's existing bucket. SecureBucket.emitDataEventStore=false is allowed only with explicit valid COMPLIANCE retention, avoiding a duplicate store in that archive. Config's inline delivery policy is removed in favor of existing account-scoped S3/KMS service grants; upgrades may need one-time operator deletion of the old policy. No cloud apply occurred. Live GitHub environment inspection confirmed required reviewers and exact main branch deployment policies for e2e-cleanup and aws-weekly-integration. Do not enable prevent-self-review blindly: the current sole configured reviewer is the repository owner.

M2 scope refinement: packages/baseline/src/aws/audit-trail.ts and audit-trail.args.ts, corresponding regressions and component docs. The same unbound CloudTrail service-role trust class exists in AuditTrail and is fixed there too. Source/AWS documentation confirms the old archive data-event default creates recursive delivery/cost growth; 3.0 uses explicit exact non-destination data buckets for AuditTrail and the distinct Config bucket for AccountFoundation. The native provider lacks RecursiveLogging; no unsupported property or cloud apply is claimed.

## M3 release contract
Allowed changes: public library manifests and internal version requirements; root/package READMEs, CHANGELOG, architecture and development/component/release docs affected by verified behavior; capability declarations; release workflow guard and signing isolation; this contract and matching release tests. Services remain unpublished. No full Rust dependency refresh. Validate exact tagged main ancestry, coordinated versions, package manifests/file lists, relevant full suite and registry readiness. Publishing is sequential and immutable: verify existing registry state before retrying. No infrastructure apply or human security-certification claim.

Independent source review reproduced hidden artifact upload loss, S3 physical-prefix length failure and admission match-condition/selector bypass. Regressions were added first; M2 applies exact admission matching and a 24-character hardened AccountFoundation name maximum. M1 scopes the hidden upload explicitly and errors when no tarballs exist. Mechanical Prettier changes from the updated formatter are restricted to existing tracked source/docs plus declared changes.

## Post-ship closeout — completed 2026-10-14
PR [#308](https://github.com/kerberosmansour/hulumi/pull/308) passed all checks and merged as b1a4962f97932d335204ba3e2bbb071ebf4a2aed. [Release v3.0.0](https://github.com/kerberosmansour/hulumi/releases/tag/v3.0.0) published all six libraries successfully in [run 38560940022](https://github.com/kerberosmansour/hulumi/actions/runs/38560940022). Registry SHA-512 integrities match all six release tarballs; GitHub attestations verify the exact commit/tag/isolated sign-and-publish.yml signer and hosted runner. Six CycloneDX SBOMs carry 3.0.0. All 25 tracked Codex reports were closed with source/regression/release evidence; no new tracked report remains. Superseded attest/checkout/setup-node PRs were closed. Broader unvalidated toolchain major upgrades remain available for reviewed work.
No AWS/Kubernetes deployment or live infrastructure validation occurred. Existing stacks still require the documented storage/admission migration; old records are not retroactively locked. Dependabot alert API remains unavailable/disabled here; zero pnpm audit findings is the verified dependency result, not a claim about unavailable GitHub alert data.

## Independent review and lessons
The external read-only SLO second-opinion pass identified two introduced defects (hidden artifact upload and physical S3 prefix length) and one existing admission-match bypass. All were reproduced and fixed, preserving legitimate component/policy compatibility. No cross-model disagreement remains on those fixes; review was source-only, not certification. Keep package artifact paths visible to upload actions, calculate physical-name suffix room, and validate admission matching authority as well as CEL content. Forced updates and green mocks do not establish cloud delivery behavior. Rollback is a reviewed revert/new immutable package release; existing COMPLIANCE objects retain their expiry.
