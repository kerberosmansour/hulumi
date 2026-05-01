# M3 completion summary — Hulumi-for-GitHub

> Closed 2026-04-26 by `/slo-execute M3`.

## Goal achieved

After M3, the Hulumi-for-GitHub policy surface is in place. `@hulumi/policies/github` ships:

- `HulumiGithubHardeningPack` — H1 (no raw `github.Repository`), H2 (no wildcard OIDC custom template), H3 (= `G_OIDC_1`, AWS/Azure/GCP trust-policy guard).
- `G_OIDC_1` — exported as a standalone CrossGuard rule for direct composition.
- `CisGithubV1Pack` — single placeholder advisory rule (real per-section rules deferred to v1.1 D4 pending CIS WorkBench access).
- `Suppression` API — one-line re-export of the AWS-side (identical shape).

`@hulumi/baseline.github.SecureRepository` and `OrgFoundation` gain the `hulumi:controls` tag/output as the staged-migration completion. The four scenario JSONs cite IDs that the new citation-ID meta-test cross-checks against `cis-github.ts` + `nist-ssdf-v1.1.ts` mapping tables.

## Files changed

### New (12)

- `packages/baseline/src/mappings/cis-github.ts` — IDs-only `as const`, `:PENDING-WORKBENCH` placeholders
- `packages/baseline/src/mappings/nist-ssdf-v1.1.ts` — IDs-only `as const`
- `packages/policies/src/github/index.ts`
- `packages/policies/src/github/g-oidc-1.ts` — covers AWS / Azure / GCP
- `packages/policies/src/github/hulumi-hardening-pack.rules.ts` — H1, H2, H3-alias
- `packages/policies/src/github/cis-v1-pack.rules.ts` — placeholder advisory
- `packages/policies/src/github/packs/hulumi-hardening.ts` — `PolicyPack` entry point
- `packages/policies/src/github/packs/cis-v1.ts` — `PolicyPack` entry point
- `packages/policies/src/github/suppressions.ts` — re-export from AWS
- `packages/policies/tests/github/hulumi-hardening-pack.test.ts` — 12 BDD rows (H1, H2, G_OIDC_1 across AWS/Azure/GCP, suppressions)
- `tests/skill-bdd/citation-id-validation.test.ts` — citation-ID meta-test (per critique E4)
- `docs/slo/lessons/hulumi-github-m3.md`
- `docs/slo/completion/hulumi-github-m3.md`

### Modified (5)

- `packages/baseline/src/mappings/index.ts` — re-export `cisGithub` + `nistSsdfV11`
- `packages/baseline/src/github/secure-repository.ts` — add `hulumi:controls` tag to description (M3 staged-migration completion)
- `packages/baseline/src/github/org-foundation.ts` + `org-foundation.outputs.ts` — add `hulumiControls: pulumi.Output<readonly string[]>` top-level output
- `packages/baseline/tests/github/secure-repository.test.ts` — flip assertion from "tag absent" to "tag present"
- `packages/baseline/tests/github/org-foundation.test.ts` — flip assertion from "no hulumiControls property" to "hulumiControls populated"
- `packages/policies/src/index.ts` — re-export `./github`
- `docs/slo/completed/RUNBOOK-hulumi-github.md` Milestone Tracker — M3 → in_progress (start) → done (close)

## Tests added

- 12 mock-runtime BDD scenarios for H1, H2, G_OIDC_1, h3NoWildcardTrustPolicy alias:
  - H1: 3 (raw repo rejected, child-of-SecureRepository allowed, suppression respected)
  - H2: 3 (wildcard rejected raw, child-of-OrgFoundation allowed, three-axis safe shape allowed)
  - G_OIDC_1: 7 (subClaimIsUnsafe unit, AWS StringLike, AWS StringEquals + wildcard, AWS safe, Azure wildcard, GCP wildcard, h3 alias)
- 4 citation-ID meta-test scenarios (E4):
  - Loads ≥4 GitHub scenarios
  - Every CIS-GitHub-v1.2.0 ID cited is present in cis-github.ts
  - Every NIST-SSDF-v1.1 ID cited is present in nist-ssdf-v1.1.ts (caught 2 fabricated IDs immediately)
  - Every framework prefix cited is recognized

## Test results

```
packages/policies test:   3 test files passed (was 2; +1 hulumi-hardening-pack.test.ts under tests/github/)
packages/drift test:      10 test files passed (no change)
tests/skill-bdd test:     3 test files, 28 tests passed (was 24; +4 citation-ID validation tests)
packages/baseline test:   8 test files, 43 passed | 8 skipped (no regression)
examples/* test:          all 3 example smokes passed

pnpm -r build:                    Done across all 3 packages
pnpm -r typecheck:                Done across all 9 workspace projects
pnpm -r lint:                     Done (0 errors, 0 warnings)
pnpm run lint:license-boundary:   OK
pnpm run lint:exact-pin-guard:    OK (4 @pulumi/* deps match pinned hashes)
```

## Documentation updated

- M3 lessons file written (4 surprises + 4 decisions + 5 rules-for-next-milestone)
- v1.1 deferrals doc gained 1 implicit follow-up: H4 tier-monotonicity AST meta-test (lessons file documents the deferral; formal v1.1.x runbook will pull it into the deferrals.md table when scheduled)

## Demo gate (deferred follow-ups)

- **CIS GitHub Benchmark v1.2.0 section numbers**: D4 in v1.1 deferrals, gated on WorkBench access.
- **CSC backend real REST hooks**: D1.5 in v1.1 deferrals (deferred from M2).
- **H4 tier-monotonicity AST meta-test**: deferred to v1.1+ — captured in this lessons file.
- **Real `pulumi up` evaluation against fixture programs**: M5 launch readiness covers cookbook examples that exercise the rules.

## Forward-references opened

- M4 adds `GithubWebhookFallbackAdapter` and extends `DriftVerdict` / `DriftSource`. Per the M3 lessons rules, M4 must avoid `pulumi.dynamic.Resource` (data-only adapter), surface controls via top-level Output, and extend the citation-ID meta-test if new framework prefixes are introduced.
- M5 SLSA-L3 release of v1.1.0 includes the new `@hulumi/policies/github/packs/{hulumi-hardening,cis-v1}` entry-point exports in package.json. Documenting the wiring from PulumiPolicy.yaml is M5 cookbook content.

## Allow-list amendment captured

No M3-specific allow-list amendment beyond the M3 runbook's allow-listed surface. The single non-trivial decision was deferring H4 tier-monotonicity AST meta-test work — captured as a v1.1+ follow-up rather than expanding M3 scope.
