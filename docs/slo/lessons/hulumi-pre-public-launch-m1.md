# Lessons Learned — hulumi-pre-public-launch Milestone 1

## What changed

NPM publish-readiness pass across all four `@hulumi/*` packages. After M1 the repo can produce four publishable tarballs that satisfy `pnpm publish --dry-run` end-to-end.

- Removed `"private": true` from `packages/{baseline,policies,drift}/package.json`. (`k8s-baseline/package.json` already lacked the field; left unset.)
- Added `repository`/`bugs`/`homepage` to all four packages, all pointing to `kerberosmansour/hulumi`. `repository.directory` set to the per-package path so npmjs.com renders the correct sub-path link.
- Bumped `@hulumi/k8s-baseline` 1.0.0 → 1.2.0 to satisfy the atomic-release invariant.
- Created `packages/{baseline,policies,k8s-baseline}/README.md` (npmjs.com-rendered). `packages/drift/README.md` left as-is (existing, used as the model).
- Copied repo-root `LICENSE` byte-identical (MD5 `3b83ef96387f14655fc854ddc3c6bd57`) into all four packages.
- Updated `README.md` v1.1.0 → v1.2.0 references; removed `(pre-release)` annotation for k8s-baseline.
- Updated `docs/ARCHITECTURE.md` line 7 to reflect the atomic 1.2.0 across all four packages.
- Folded the version reconciliation into the existing `[1.2.0] — 2026-05-01` `CHANGELOG.md` entry (no tag had been cut, so editing the unshipped entry was correct, not history rewriting).
- Deleted `package-lock.json`; added `package-lock.json` and `yarn.lock` to `.gitignore` so pnpm-divergent lockfiles can't sneak back in.
- Added `.claude/` to `.gitignore` (coding-agent harness session state shouldn't be committed).
- Extended `packages/k8s-baseline/tests/release-readiness.test.ts` with a new `describe("Feature: Atomic four-package publish-readiness …")` block — 16 new test cases enforcing per-package `private`/`publishConfig`/`repository`/`bugs`/`homepage` shape, atomic version invariant, README presence, and LICENSE byte-equality with repo root.

## Design decisions and why

- **k8s-baseline 1.0.0 → 1.2.0 (rather than 1.1.0 → 1.2.0 sequencing).** The atomic four-package release is non-negotiable per `release-readiness.test.ts`. Keeping k8s-baseline at 1.0.0 while shipping 1.2.0 of the others would require either relaxing the atomic invariant (large blast radius) or a separate k8s-baseline-only release (carries its own coordination cost). The skip from 1.0.0 directly to 1.2.0 is documented in the CHANGELOG entry.
- **`"private"` field omitted, not set to `false`.** k8s-baseline already lacked the field; the other three had `"private": true`. Removed entirely rather than flipping to `false` because the absence is the npm-publish default. `release-readiness.test.ts` asserts `private === undefined || private === false` so both shapes pass.
- **Per-package README is self-contained.** Wrote each README assuming the reader landed on npmjs.com without seeing the GitHub repo. Each links back to specific repo paths via absolute URLs (`https://github.com/kerberosmansour/hulumi/...`) rather than relative paths, because relative paths only work on GitHub's web UI, not on npmjs.com.
- **CHANGELOG edit, not new entry.** No git tag exists for v1.2.0; the entry was a planned-release narrative, not a shipped artifact. Editing it in place to reconcile the k8s-baseline version was correct, not retroactive rewriting.
- **Folded `.claude/` into `.gitignore` proactively.** The agent harness leaves session state behind; a single accidental `git add -A` would commit it without the ignore rule.
- **`yarn.lock` blocked in `.gitignore` along with `package-lock.json`.** Belt-and-braces: the original audit finding was about `package-lock.json`, but blocking yarn's lockfile is the same defense.

## Assumptions verified

- **`pnpm publish --dry-run` succeeds for all four packages without npm credentials.** Verified — dry-run only validates package shape; no auth required.
- **`npm pack --dry-run` includes LICENSE and README without explicit `files` array entries.** Verified — npm has built-in conventions that include LICENSE/README/CHANGELOG/NOTICE at the tarball root regardless of `files`.
- **The atomic-release invariant in `release.yml` is enforced by `release-readiness.test.ts`.** Verified — the existing test asserts the four package names appear in `release.yml`'s pack loop; M1 adds the version-equality assertion.
- **Editing the unshipped `[1.2.0]` CHANGELOG entry is not history rewriting.** Verified — `git tag -l 'v*'` returned empty.
- **`.claude/` is harness session state, not user-authored content.** Verified — directory contents are tooling state.

## Assumptions still unresolved

- **The `@hulumi` npm scope is unclaimed.** Out of M1's scope (P0, user action). When `pnpm publish` runs for real, scope ownership must exist. Tested with `--dry-run` only.
- **`hulumi.io` domain status.** Out of M1's scope; addressed in M2 via `.github/SECURITY-CONTACTS` placeholder (and ultimately by the user registering the domain or rerouting all references).
- **Whether `@hulumi/k8s-baseline` consumers exist outside the repo.** None are known internally, but a public pre-release of `1.0.0-pre.1` may have been distributed (e.g., via tarball upload, manual install). If any external consumer pinned `1.0.0-pre.1`, the 1.0.0 → 1.2.0 jump bypasses 1.0.0 entirely. CHANGELOG documents this; no action item identified.

## Mistakes made

- **Authored the runbook with prettier-failing markdown.** Forgot to run `pnpm run format` after writing `docs/slo/current/RUNBOOK-hulumi-pre-public-launch.md`; the baseline format check failed and had to be repaired before BDD-first could begin. Cost: one extra round of `pnpm run format` + re-run.
- **Initially considered a separate `[1.2.1]` CHANGELOG entry for the k8s-baseline reconciliation.** Caught before committing — the v1.2.0 hadn't shipped, so editing in place was correct. Lesson: check git tags before assuming a CHANGELOG entry is historical.

## Root causes

- **Missing the prettier step on new markdown files.** The runbook's own static-analysis gates (Section 4.2) include format check; the runbook authoring step itself isn't covered by the slo-plan skill. Future: format the runbook as part of slo-plan output, OR have slo-execute pre-flight Step 0 always include a format pass before declaring baseline green.
- **CHANGELOG-vs-tag confusion is a recurring class.** Treating a CHANGELOG entry as historical when no tag exists is a mistake to make once. Recorded here so future-me can move faster.

## What was harder than expected

- **Test fixture noise.** `kubernetes-secret-from-asm.test.ts` emits 66 unhandled-rejection logs from existing fail-closed test scenarios. They're cosmetic noise, not failures (exit 0, all 167 tests pass). Investigated to confirm the noise was pre-existing, not caused by my changes. Adds friction to baseline test reading.

## Invariants/assertions added or strengthened

- `manifest.private === undefined || manifest.private === false` — encoded per package in `release-readiness.test.ts:103-110`.
- `manifest.publishConfig.access === "public"` — encoded.
- `manifest.publishConfig.provenance === true` — encoded.
- `manifest.license === "Apache-2.0"` — encoded.
- `repository.url`, `bugs.url`, `homepage` all contain `https://github.com/kerberosmansour/hulumi` — encoded.
- All four package versions are equal (atomic-release invariant) — encoded as `Set(versions).size === 1`.
- All four package versions match `^1\.2\.\d+/` — encoded.
- Each package has a non-empty `README.md` — encoded as `existsSync` + `statSync(...).size > 0`.
- Each package's `LICENSE` is byte-identical to repo-root `LICENSE` — encoded as exact-string equality.

## Resource bounds established or verified

None new. M1 is mechanical; no new collections, queues, retries, caches, or recursion introduced.

## Debugging / inspection notes

- `npm pack --dry-run --json | jq '.[0].files[].path'` is the right inspection for tarball contents. The `.files` array surfaces every path with `mode`, `size`, and the on-disk source — useful for confirming `dist/` shape without unpacking.
- `pnpm publish --dry-run` prints `total files: <N>` matching the `npm pack` count. Confirmed all four match: 211 / 96 / 59 / 137 files.
- `md5 packages/*/LICENSE LICENSE` confirms byte-identity in one shot.

## Naming conventions established

- New constant `PUBLISHABLE_PACKAGES` in `release-readiness.test.ts` — single source of truth for the four-package set in tests. Future BDD additions for the atomic-release invariant should reuse it.
- New constant `CANONICAL_REPO_URL` — single source for the GitHub URL. If the repo ever moves, this is the only edit.
- New interface `PublishablePackageJson` — typed shape of the manifest fields M1 cares about.

## Test patterns that worked well

- `it.each(PUBLISHABLE_PACKAGES)("@hulumi/%s ...", (pkg) => { ... })` cleanly parallelizes per-package assertions without duplicating code. Vitest's `it.each` with a tuple+template-string title produces readable failure output.
- Custom assertion messages (`expect(x, "specific reason").toBe(y)`) made every failure cite the exact package name and field — saved time relative to generic `expect(x).toBe(y)` failures.

## Missing tests that should exist now

- **Tarball contents diff against `files` declaration.** Today the test asserts the file set is correct via `npm pack --dry-run` external command (smoke test, not vitest). A vitest test that walks `JSON.parse(package.json).files` and asserts every glob expands to the dist files would be tighter — but not required for M1's Definition of Done.
- **`pnpm install --frozen-lockfile` succeeds after `package-lock.json` deletion.** Tested manually in the Evidence Log; not encoded as a vitest test. Would belong in CI's `release-readiness` invocation if it's not already there.

## Rules for the next milestone (M2)

- **Run `pnpm run format` before committing any new markdown.** The runbook's own format gate fires whether the file is in `docs/` or anywhere else under prettier's scan.
- **Check `git tag -l 'v*'` before editing CHANGELOG entries.** Saves the "is this rewriting history?" mental cycle.
- **`.claude/` is harness state — never commit.** Already in `.gitignore` after M1.
- **For mechanical milestones, BDD-first still pays off.** The 16 release-readiness assertions caught me from misformatting one homepage URL during the package.json edits — failed test pointed at the exact package, exact field.
- **Read `release.yml` early in any milestone touching package.json.** It's the source of the atomic-release invariant; missing it would have shipped a version-skewed M1.

## Template improvements suggested

- **`/slo-plan` should run `pnpm run format` (or the project's formatter) on the runbook file it just authored.** Today it produces prettier-failing markdown. One-line fix in slo-plan's Step 0.
- **Consider adding a "package.json hygiene check" to the v4 template's Section 4.2 static-analysis table** for monorepo runbooks — `private`-flag and `publishConfig` shape lint as a cheap CI step.
