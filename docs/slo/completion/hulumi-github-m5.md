# M5 completion summary — Hulumi-for-GitHub

> Closed 2026-04-26 by `/slo-execute M5`.

## Goal achieved

After M5, the Hulumi-for-GitHub v1.1.0 release surface is in place:

- All three packages (`@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`) version-bumped 1.0.0 → 1.1.0 atomically with descriptions updated for the GitHub variant.
- Package.json `exports` extended with `@hulumi/baseline/github`, `@hulumi/policies/github/packs/hulumi-hardening`, and `@hulumi/policies/github/packs/cis-v1` subpaths.
- CHANGELOG.md v1.1.0 entry covers every M1–M4 deliverable, the staged-migration completions (hulumi:controls tag, cache schema v1→v2), the non-suppressible verdict fields, and the v1.1 deferral list.
- README.md updated: title + version + "What's in the box" table reflect the v1.1.0 GitHub additions.
- AGENTS.md updated: skill description + runbooks index + license posture cover the GitHub variant + infra-only scope contract.
- `docs/cookbooks/github-webhook-drift.md` cookbook ships — covers two wiring patterns (AWS Lambda + API Gateway, Cloudflare Worker) plus HMAC secret rotation runbook.
- `examples/secure-repository-smoke/` example ships — minimum-viable Pulumi program demonstrating the v1.1 wedge surface, smoke-tested under mock runtime (1 BDD assertion green).
- All v1.0.0 AWS regression tests continue to pass.
- Pre-flight discipline holds: pin-guard OK (4 deps), license-boundary OK, lint clean, typecheck clean.

Scope-trimmed deliverables (4 additional cookbooks, 5 component reference docs, 2 additional examples, weekly integration workflow extension, getting-started + why-hulumi updates) deferred to v1.1.x patches per the lessons file. The release is feasible to publish today.

## Files changed

### New (8)

- `docs/cookbooks/github-webhook-drift.md` — operational cookbook (wiring + rotation runbook)
- `examples/secure-repository-smoke/index.ts` — minimum-viable Pulumi program
- `examples/secure-repository-smoke/package.json` — pnpm workspace registration
- `examples/secure-repository-smoke/Pulumi.yaml` — Pulumi project metadata
- `examples/secure-repository-smoke/tsconfig.json`
- `examples/secure-repository-smoke/vitest.config.ts`
- `examples/secure-repository-smoke/tests/smoke.test.ts` — mock-runtime BDD asserting tier-delta + hulumi:* tag triple
- `examples/secure-repository-smoke/README.md` — usage + prerequisites
- `docs/lessons/hulumi-github-m5.md`
- `docs/completion/hulumi-github-m5.md`

### Modified (5)

- `CHANGELOG.md` — v1.1.0 entry above v1.0.0 entry
- `README.md` — title bump, "What's in the box" table extended
- `AGENTS.md` — skill description + runbooks + license posture extended for GitHub
- `packages/baseline/package.json` — version 1.0.0 → 1.1.0; description updated; `./github` export added
- `packages/policies/package.json` — version bump; description; `./github/packs/{hulumi-hardening,cis-v1}` exports added
- `packages/drift/package.json` — version bump; description updated to mention 5 adapters + tierDegraded
- `pnpm-lock.yaml` — re-resolved
- `docs/RUNBOOK-hulumi-github.md` Milestone Tracker — M5 → in_progress (start) → done (close)

## Tests added

- 1 mock-runtime smoke test in `examples/secure-repository-smoke/tests/smoke.test.ts`:
  - asserts `smoke-sandbox` and `smoke-hardened` repos register as `github:index/repository:Repository`
  - asserts both descriptions carry `hulumi:component=SecureRepository`, `hulumi:tier=...`, `hulumi:controls=...` (M3 staged-migration tag triple)
  - asserts ruleset tier delta: startup-hardened has `requiredSignatures: true`; sandbox does not

## Test results

```
packages/policies test:   3 test files, all pass
packages/drift test:      12 test files, 54 tests pass
tests/skill-bdd test:     3 test files, 28 tests pass
packages/baseline test:   8 test files, 43 passed | 8 skipped
examples/* test:          4 example smokes pass (was 3; +secure-repository-smoke)

pnpm -r build:                    Done across all 3 packages
pnpm -r typecheck:                Done (no errors)
pnpm -r lint:                     Done (0 errors, 0 warnings)
pnpm run lint:license-boundary:   OK
pnpm run lint:exact-pin-guard:    OK (4 @pulumi/* deps match pinned hashes)
```

## Documentation updated

- M5 lessons file written (3 surprises + 4 decisions + 5 rules-for-v1.1.x-patch-cadence)
- All M1, M2, M3, M4, M5 lessons + completion files in place
- v1.1.0 CHANGELOG entry comprehensive
- README + AGENTS reflect the v1.1 GitHub variant

## Demo gate (deferred follow-ups → v1.1.x patches)

- 4 additional cookbooks (OIDC trust, Actions supply-chain, App tokens, self-hosted runners) — partially served by `docs/threat-model-examples/github-*.md` exemplars meanwhile.
- 6 component reference docs — M1–M4 lessons + completion + scenario JSONs serve as reference.
- 2 additional examples (`org-foundation-smoke`, `github-drift-smoke`).
- Weekly integration workflow extension to GitHub sandbox suite.
- `getting-started.md` + `why-hulumi.md` updates.
- Real sandbox-org integration test runs (env-vars-gated; M1 + M2 integration suites ship green-on-skip).

## Forward-references opened

- v1.1.x patch cadence per the M5 lessons file's rules-for-v1.1.x — each deferred deliverable in its own patch.
- v1.1+ deferrals tracked in `docs/runbook-milestones/hulumi-github-v1.1-deferrals.md`: D1 (audit-log REST adapter), D1.5 (CSC real REST hooks), D2 (EnterpriseSecurityAnalysisSettings), D3 (audit-log streams), D4 (CIS WorkBench section completion), D5 (GitHub App org-admin scope scenario), D6 (Oracle/IBM Cloud OIDC).

## Release readiness

The v1.1.0 release is **publishable**. To ship: tag `v1.1.0`, push, observe SLSA L3 attestation generation in CI, run `pnpm run release:verify-attestations` once tarballs are published, post the announcement.

`/slo-execute` ran all five milestones (M1–M5) autonomously in a single chain at user direction. The plan moved from "ready for execution" (M1 not started) to "v1.1.0 publishable" with no abandoned blockers and clean evidence trails throughout.
