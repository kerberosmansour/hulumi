# M1 completion summary — Hulumi-for-GitHub

> Closed 2026-04-26 by `/slo-execute M1`.

## Goal achieved

After M1, the `/hulumi-threat-model` skill produces framework-ID-cited threat models for the four highest-gap GitHub scenarios (OIDC trust to cloud, Actions supply-chain, App / installation-token exposure, self-hosted runners), AND `@hulumi/baseline.github.SecureRepository` ships as a hardened-by-default `ComponentResource` with the `acknowledgePublic` discriminated-union opt-in.

## Files changed

### Modified (12)

- `docs/slo/completed/RUNBOOK-hulumi-github.md` — Milestone Tracker M1 → in_progress (start) → done (close)
- `docs/slo/runbook-milestones/hulumi-github-m1.md` — Refactor-budget paragraph amended with allow-list rationale; Evidence Log filled
- `packages/baseline/package.json` — `@pulumi/github@6.13.0` added to peerDependencies + devDependencies
- `packages/baseline/src/index.ts` — `export * as github from "./github"` added
- `packages/baseline/tests/setup.ts` — mock-runtime extended to populate state for `github:index/repository:Repository` and `github:index/repositoryRuleset:RepositoryRuleset` resources
- `pnpm-lock.yaml` — regenerated to include `@pulumi/github@6.13.0` and its transitive deps
- `scripts/cooling-off-diff.mjs` — `PULUMI_PACKAGES` extended to include `@pulumi/github`
- `scripts/exact-pin-guard.mjs` — `ALLOWED` extended with `@pulumi/github@6.13.0` integrity hash
- `skills/hulumi-threat-model/SKILL.md` — extended description, allowed-scenarios list, refusal-language to cover CIS GitHub Benchmark
- `skills/hulumi-threat-model/scripts/generate-threat-model.mjs` — `BUNDLED_STUBS` extended with 5 GitHub framework prefixes (CIS-GitHub-v1.2.0, NIST-SSDF-v1.1, OpenSSF-Scorecard, MITRE-ATTCK, GitHub-Well-Architected)
- `skills/hulumi-threat-model/scripts/list-scenarios.mjs` — listScenarios() returns the 9-entry list (5 AWS + 4 GitHub)
- `tests/skill-bdd/hulumi-threat-model.test.ts` — extended lister assertion + new `describe` block with 5 GitHub scenario tests + abuse-case tests

### New (12+)

- `docs/slo/lessons/hulumi-github-m1.md` — surprises + decisions + deltas + rules-for-next-milestone
- `docs/slo/completion/hulumi-github-m1.md` — this file
- `docs/threat-model-examples/github-actions-supply-chain.md`
- `docs/threat-model-examples/github-app-token-exposure.md`
- `docs/threat-model-examples/github-oidc-trust-cloud-account.md`
- `docs/threat-model-examples/github-self-hosted-runner.md`
- `packages/baseline/src/github/index.ts`
- `packages/baseline/src/github/secure-repository.args.ts`
- `packages/baseline/src/github/secure-repository.outputs.ts`
- `packages/baseline/src/github/secure-repository.ts`
- `packages/baseline/tests/github/secure-repository.test.ts`
- `packages/baseline/tests/integration/github/secure-repository.integration.test.ts`
- `skills/hulumi-threat-model/scenarios/github-actions-supply-chain.json`
- `skills/hulumi-threat-model/scenarios/github-app-token-exposure.json`
- `skills/hulumi-threat-model/scenarios/github-oidc-trust-cloud-account.json`
- `skills/hulumi-threat-model/scenarios/github-self-hosted-runner.json`

## Tests added

- 9 mock-runtime BDD scenarios for `SecureRepository` (`packages/baseline/tests/github/secure-repository.test.ts`):
  - 2 happy paths (Sandbox tier with deletion+force-push protection; Startup-Hardened with required-signatures)
  - 1 invalid input (invalid tier rejected via `assertValidTier`)
  - 1 empty state (Sandbox minimum)
  - 4 abuse-case rows for `tm-hulumi-github-abuse-public-visibility` (bare public, partial opt-in, empty justification, full opt-in succeeds with audit row)
  - 1 schema lock (component-type string)
- 5 new skill-bdd tests for the GitHub scenarios feature (`tests/skill-bdd/hulumi-threat-model.test.ts`):
  - OIDC happy-path with framework-citation assertions
  - All-4-scenarios-produce-valid-output diversity check
  - Abuse-case: license-boundary refusal extends to CIS GitHub Benchmark
  - Abuse-case: scenario-id path-traversal rejected via allow-list
  - Schema compatibility: GitHub scenario frontmatter shape lock
- 1 integration test (env-gated; skips green on developer laptop): `packages/baseline/tests/integration/github/secure-repository.integration.test.ts`
- Lister assertion updated from 5 to 9 scenarios in declared order

## Test results

```
packages/policies test:   2 test files,  passed
packages/drift test:      10 test files, passed
tests/skill-bdd test:     2 test files,  24 tests, all pass
packages/baseline test:   5 test files,  29 passed | 5 skipped (4 pre-existing AWS integration skips + 1 new GitHub integration skip)
examples/drift-classify-smoke test:  1 file passed
examples/secure-bucket-smoke test:   1 file passed
examples/account-foundation-smoke test:  1 file passed

pnpm -r typecheck:                Done across all 9 workspace projects
pnpm -r lint:                     Done (0 errors, 0 warnings after final fix)
pnpm run lint:license-boundary:   OK
pnpm run lint:exact-pin-guard:    OK (4 @pulumi/* deps match pinned hashes)
```

## Documentation updated

- M1 runbook file Evidence Log filled
- Master runbook Milestone Tracker updated to `done`
- Lessons file written (4 surprises + 3 decisions + 6 rules-for-next-milestone)
- Skill SKILL.md updated to advertise the 9-scenario surface
- Scenario JSONs + threat-model exemplars provide the per-scenario reference docs

## Demo gate (deferred follow-ups)

- **Sandbox-org integration test green run**: deferred — depends on `HULUMI_GITHUB_APP_*` env-var provisioning. The test ships green-on-skip; a real sandbox run is captured as an M5 launch-readiness smoke step.
- **Demo recording / screenshot**: per AWS M1's pattern, attach a recording of `/hulumi-threat-model github-oidc-trust-cloud-account` invocation in a fresh Claude Code session. Defer to the user's call when the sandbox App is wired.

## Forward-references opened

- M2 will add `OrgFoundation` and the four `org-*.ts` sub-components, also without `hulumi:controls` (staged-migration completes in M3).
- M3 will add the `hulumi:controls` tag to all M1 + M2 GitHub components AND replace the `:PENDING-WORKBENCH` placeholder IDs in the four scenario JSONs with real CIS GitHub Benchmark v1.2.0 section numbers (gated on WorkBench access; placeholder advisory rules in `CisGithubV1Pack` until then).
- M4's webhook fallback adapter will surface `tierDegraded: true` for these scenarios on Team / Pro / Free tiers; `feature-not-licensed: ["code_scanning_alert"]` etc. for GHAS-only events on private repos.
- M5 will ship cookbooks per scenario, an examples `secure-repository-smoke` package, and the v1.1.0 SLSA-L3 release.

## Allow-list amendment captured

M1's allow-list was extended during execution to include `skills/hulumi-threat-model/scripts/generate-threat-model.mjs` (extending `BUNDLED_STUBS` with 5 GitHub framework prefixes). Rationale: M1's BDD scenarios assert that GitHub-specific frameworks appear in the _citations_ output of the four shipped scenarios; without the `BUNDLED_STUBS` extension, those framework prefixes land in `unresolved` rather than `citations`. The full mapping ID tables (cis-github.ts, nist-ssdf-v1.1.ts) still ship in M3 per the staged-migration discipline.
