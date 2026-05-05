# Completion Summary — hulumi-pre-public-launch Milestone 5

## Goal completed

Four new stranger-facing docs land before the public-flip:
`docs/faq.md`, `docs/v2-migration.md`,
`docs/cookbooks/migration-from-terraform.md`,
`docs/cookbooks/migration-mid-stack-adoption.md`. Issues #17, #22, #34
closed. The runbook is now complete; all 5 milestones are `done`.

## Files changed

- `docs/faq.md` — NEW (19 H3 entries across 5 categorical H2 sections).
- `docs/v2-migration.md` — NEW (design doc, not release commitment).
- `docs/cookbooks/migration-from-terraform.md` — NEW (Terraform → Pulumi + Hulumi state-import path).
- `docs/cookbooks/migration-mid-stack-adoption.md` — NEW (Hulumi-component adoption inside an existing Pulumi project).
- `docs/cookbooks/README.md` — added 2 new rows linking the migration cookbooks.
- `README.md` — Documentation table now includes the FAQ.
- `CHANGELOG.md` — entry under [1.2.0] "Changed".
- `docs/slo/lessons/hulumi-pre-public-launch-m5.md` — NEW.
- `docs/slo/completion/hulumi-pre-public-launch-m5.md` — NEW.
- `docs/slo/current/RUNBOOK-hulumi-pre-public-launch.md` — milestone tracker entry updated to `done` (final milestone).

## Tests added

None. M5 is docs-only. The license-boundary lint + format-check CI gates are the regression safety net.

## Runtime validations added

None. The license-boundary lint over the four new docs is the runtime check; `pnpm run lint:license-boundary` exits 0.

## Static analysis and formatter evidence

- `pnpm -r typecheck` — clean
- `pnpm -r build` — clean
- `pnpm -r lint` — clean
- `pnpm run lint:license-boundary` — `OK (IDs-only policy upheld across scanned trees)` (the new docs cite framework IDs only — no verbatim CCM/CIS/NIST text)
- `pnpm run lint:exact-pin-guard` — `OK (11 pinned deps match expected integrity hashes)`
- `pnpm run format:check` — clean
- `pnpm -r test` — green (483 tests across the workspace; M5 added zero tests)

## Compatibility checks performed

- M1 invariants — release-readiness.test.ts green (atomic version + per-package shape).
- M2 invariants — workflow-action-pinning.test.ts green (SHA pinning enforced).
- M3 invariants — cooling-off-diff.test.ts + scp-teardown.test.ts green.
- M4 invariants — exact-pin-guard.test.ts green (11 pinned deps).
- No source / test / config / workflow changes outside docs + CHANGELOG + README.
- License-boundary lint passes on every new doc.

## Invariants/assertions added

None new (docs-only milestone).

## Resource bounds added or verified

None.

## Documentation updated

Per-file already listed under Files changed. Net new public-facing docs: 4. Updated index/discovery surfaces: 2 (`docs/cookbooks/README.md`, root `README.md`).

## .gitignore changes

None.

## Test artifact cleanup verified

`git status` shows only the M5 file changes; no untracked test artifacts.

## Deferred follow-ups

- **Component-reference doc alias audit**: `migration-mid-stack-adoption.md` cites "the component's reference doc lists the canonical aliases"; the referenced reference docs may not yet enumerate alias surfaces. Audit + fill in is a small follow-up. Filed in M5 lessons.
- **Markdown link-check vitest test**: a future enhancement could walk every doc and assert internal links resolve. Deferred — not blocking the public flip.
- **FAQ-vs-lessons-file lockstep test**: a vitest test that asserts every FAQ entry has a corresponding lessons-file citation. Deferred for the same reason.

## Known non-blocking limitations

- The v2.0 migration doc cites a future `V1_BUCKET_ALIASES` export name that's not yet implemented (correctly — v2 hasn't shipped). Future v2 design must confirm the exact name.
- The Terraform-migration cookbook's `pulumi import` command shapes are typical-shape examples; the exact import-arg syntax depends on each user's resource. Cookbook doesn't try to be exhaustive — it's an adoption guide, not a Pulumi reference.

## Final runbook handoff

This is the last milestone of `hulumi-pre-public-launch`. Status of every audit-derived finding:

| Audit category                                              | Status                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------- |
| P0-mechanical (private flag, README/LICENSE, repo metadata) | Closed in M1                                            |
| P0-external (hulumi.io domain, @hulumi npm scope)           | Out of runbook scope (user-side actions)                |
| P1 #1 (version coherence)                                   | Closed in M1                                            |
| P1 #2 (duplicate lockfiles)                                 | Closed in M1                                            |
| P1 #3 (research-scratch files)                              | Closed in M2 (deleted)                                  |
| P1 #4 (.github/SECURITY-CONTACTS)                           | Closed in M2                                            |
| P1 #5 (sandbox AWS account ID redaction)                    | Closed in M2                                            |
| P1 #6 (third-party action SHA pinning)                      | Closed in M2                                            |
| P2 #21 (drift integration test)                             | Closed in M3 (it.todo + roadmap)                        |
| P2 #24 (account-foundation integration test)                | Closed in M3 (it.todo + roadmap)                        |
| P2 #26 (cooling-off-diff fixtures)                          | Closed in M3 (real implementation)                      |
| P2 #30 (SCP teardown verification)                          | Closed in M3 (fixture-replay implementation)            |
| P2 #28 (poll.ts decision)                                   | Closed in M4 (removed)                                  |
| P2 #27 (pin-guard extension)                                | Closed in M4 (drift runtime deps + bare-header support) |
| P2 #22 (v2.0 migration plan)                                | Closed in M5                                            |
| P2 #34 (migration cookbooks)                                | Closed in M5                                            |
| P2 #17 (top-level FAQ)                                      | Closed in M5                                            |

The repo is ready for:

1. User to register `hulumi.io` domain + configure MX (then the deferred-status note in `.github/SECURITY-CONTACTS` becomes "active").
2. User to claim `@hulumi` npm scope on npmjs.com.
3. Maintainer to flip the repo visibility from private → public.
4. Maintainer to tag `v1.2.0` and let `release.yml` ship the four packages atomically.
