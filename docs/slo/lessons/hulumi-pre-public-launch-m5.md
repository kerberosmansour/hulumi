# Lessons Learned — hulumi-pre-public-launch Milestone 5

## What changed

Pure docs milestone — four new docs covering the stranger-facing gaps before the public flip.

- **`docs/faq.md`** (NEW) — 19 H3 entries across 5 H2 categories (Adoption, Common gotchas, Repo-mechanical, Pre-launch, Where to report). Mined from the lessons-learned files for recurring patterns: vitest-pool gotcha, BucketV2 deprecation, `@pulumi/*` cooling-off, license-boundary lint, DCO sign-off, atomic-release invariant, `package-lock.json` reappearance, the "two M4s" disambiguation, etc.
- **`docs/v2-migration.md`** (NEW) — design doc for the future v2.0 BucketV2 → non-V2 migration. Sections: motivation, affected resource surface (5-row table), URN-compatibility rationale, 5-step consumer migration, what v1.x does NOT commit to, 6-month compatibility window, 5 open questions for v2.0 design. Explicitly framed as a contract, not a release commitment.
- **`docs/cookbooks/migration-from-terraform.md`** (NEW) — covers the Terraform → Pulumi + Hulumi state-import path. Inventory, mapping table, `pulumi import` per resource, drift reconciliation, surgical-target apply, terraform destroy at the end. Greenfield-cutover redirected to `account-bootstrap.md`.
- **`docs/cookbooks/migration-mid-stack-adoption.md`** (NEW) — covers swapping hand-rolled AWS resources for Hulumi components in-place using `aliases` + `dependsOn`. Step-by-step alias usage, drift expectations during transition, alias removal once sticky, common pitfalls.
- **`docs/cookbooks/README.md`** — index updated to link the two new migration cookbooks.
- **`README.md`** — Documentation table now links the FAQ.
- **`CHANGELOG.md`** — entry under [1.2.0] "Changed".

## Design decisions and why

- **FAQ entries categorized into 5 H2 buckets, not flat.** A single flat list of 19 questions becomes hard to scan; categorization (Adoption / Common gotchas / Repo-mechanical / Pre-launch / Where to report) lets a reader jump to the right area. Mirrors the structure of stripe-style developer docs FAQs.
- **FAQ entries cite lessons files but don't quote them verbatim.** The lessons files are the source of truth; the FAQ is the discoverability layer. Quoting verbatim would create maintenance debt (lessons-file edits would break the FAQ); citing by reference (`see lessons file X`) means the FAQ stays valid as lessons evolve.
- **v2-migration.md is a design doc, NOT a release plan.** The audit's framing of issue #22 was "draft v2.0 BucketV2→non-V2 migration plan" — the word "plan" can imply a release commitment. I deliberately framed the doc as "contract for whenever v2.0 lands" with explicit "what v1.x does NOT commit to" section. Public users get the migration shape they need to plan; Hulumi doesn't promise a release date.
- **5 open questions for v2.0 design.** Rather than answering them in M5 (which would over-commit), they're listed as decisions the v2.0 runbook will need to make. Future v2 author has a starting point.
- **Mid-stack adoption cookbook leans heavily on `aliases`.** This is the load-bearing technique for non-destructive adoption. The cookbook explains the technique once with a worked example, then references it throughout. Avoids re-explaining alias mechanics in every step.
- **Both migration cookbooks redirect to existing recipes for happy paths.** "Greenfield cutover" → `account-bootstrap.md`. "Drift detection post-migration" → `drift-detection.md`. Reduces duplication and keeps the new cookbooks focused on the migration-specific gotchas.
- **CHANGELOG entry is one paragraph, not a section.** M5 is docs-only; doesn't warrant breaking out a new "Documentation" subsection in the changelog. Folded into the existing "Changed" list.
- **No update to ARCHITECTURE.md.** No architecture change. Docs about migration paths don't change the runtime architecture.
- **No new test files.** M5's "test" is the existing CI gates (license-boundary lint, format check). Adding unit tests for doc presence would be over-engineered for inert content.

## Assumptions verified

- The `examples/account-foundation-smoke` test output emits BucketV2 deprecation warnings. Verified via the pre-M1 baseline test run.
- License-boundary lint passes on the new docs. Verified by running `pnpm run lint:license-boundary` post-write.
- The cookbooks index format accepts new rows without restructuring. Verified by the prettier reformat producing only column-width changes.
- 6-month compatibility window aligns with the SECURITY.md "Supported versions" table convention. Verified by reading `SECURITY.md` lines 132-141.
- The atomic-release invariant means consumers can't be on v1.x of one package and v2.x of another. Verified by reading `release-readiness.test.ts`.

## Assumptions still unresolved

- **The exact alias export shape (`V1_BUCKET_ALIASES` vs builder function) is open.** v2-migration.md commits to providing aliases but doesn't pin the shape. Resolved by the v2.0 design runbook.
- **The migration cookbooks reference component reference docs that may not yet exist.** `migration-mid-stack-adoption.md` cites "the component's reference doc lists the canonical aliases"; the actual reference docs may not list aliases today. Future M5 follow-up: audit `docs/components/*.md` for alias coverage. Not blocking — the cookbook structure is correct; the referenced section can be filled in.
- **The FAQ's "Are the integration tests actually running?" entry says 7 of the integration test slots are `it.todo()` — accurate at end of M3.** If a future runbook implements some of them, the FAQ entry needs an update.

## Mistakes made

- **Initial BDD scenario said `grep -c '^## '` should be ≥ 10 for the FAQ** — wrong count semantics. The H2 headings are categorical (only 5); the actual FAQ entries are H3 (19). Fixed in lessons + evidence log; the substantive coverage is well above target.

## Root causes

- **Test/scenario authoring against unintended count semantics.** Pattern recurs across runbook milestones (cf. M2's NPM_TOKEN regex, M3's downgrade fixture, M4's escape-hatch regex). Mitigation: when authoring a numerical assertion, eyeball the actual count against real fixture/source before treating the threshold as the contract.

## What was harder than expected

- **Authoring all four docs without slipping into competitor-comparison or "vs Terraform" framing.** The migration-from-terraform doc is positioned as "if you have a Terraform stack, here's the path" — not "Pulumi+Hulumi vs Terraform". Brand discipline; trivial to slip into the wrong shape.
- **The FAQ-vs-lessons-file boundary.** Decided FAQ is discoverability layer, not duplicated content. Lessons files keep the original incident; FAQ summarizes and points. Took one round of "should I quote this lesson?" before settling.

## Invariants/assertions added or strengthened

None new beyond the BDD scenarios already encoded earlier in this runbook. M5 is docs-only; the CI gates (license-boundary lint, format check) provide the regression safety net.

## Resource bounds established or verified

None. M5 is inert docs.

## Debugging / inspection notes

- `grep -c '^### '` is the right count for FAQ entries. `^## ` counts categorical headings.
- `grep -lE '(gotcha|lesson|mistake|surpris|wrong|tricky)' docs/slo/lessons/*.md` is a useful first-pass for "which lessons files have gotcha-shaped content."
- Reading `examples/account-foundation-smoke` test output gives concrete BucketV2 deprecation warning quotes for v2-migration.md.

## Naming conventions established

- Migration cookbooks named `migration-from-X.md` for cross-tool, `migration-X-adoption.md` for within-Pulumi adoption shapes. Future migration cookbooks should follow the same convention.

## Test patterns that worked well

- **License-boundary lint on every docs PR is the load-bearing test.** It catches the "I accidentally pasted CCM control text" failure mode. Confirmed: passed on M5's 4 new docs.

## Missing tests that should exist now

- **A vitest test that walks every cookbook + doc and asserts internal links resolve.** Today, the FAQ's "see [drift-detection.md](./cookbooks/drift-detection.md)" links could rot if files are renamed. Considered for M5; deferred — markdown link checking is a known-tractable enhancement that warrants its own small workstream.
- **A vitest test that asserts the 19 FAQ entries each have a corresponding lessons-file source.** Would prevent FAQ drift. Deferred for the same reason.

## Rules for the next milestone (N/A — M5 is the last)

This was the final milestone of the runbook. Final handoff:

- All 5 milestones are `done` in the tracker.
- All P1 + P2 audit findings are closed (some via real implementation, some via `it.todo` + roadmap doc, some via dead-code removal, some via docs).
- The repo is technically ready to flip public; the remaining gates (`hulumi.io` domain registration, `@hulumi` npm scope claim) are user-side actions per the original audit.

## Template improvements suggested

- **The v4 template's BDD acceptance scenario format could allow "≥ N" thresholds with explicit count semantics.** I wrote "≥ 10" without specifying H2 vs H3 vs entries; unambiguous count semantics would have prevented the M5 mistake noted above.
- **A "no-test-changes" milestone should still have an Evidence Log row for "license-boundary lint" because that's the de facto regression gate.** The M5 BDD covered this implicitly; making it explicit in the v4 template would help.
