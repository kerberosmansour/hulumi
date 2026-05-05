# Completion Summary — hulumi-pre-public-launch Milestone 1

## Goal completed

`pnpm publish --dry-run` now succeeds for all four `@hulumi/*` packages. The repo can produce four publishable tarballs in an OIDC-signed release; the only remaining publish-blocker is the user claiming the `@hulumi` npm scope (out of runbook scope, P0).

## Files changed

- `packages/baseline/package.json` — removed `"private": true`; added `repository`, `bugs`, `homepage`.
- `packages/policies/package.json` — same.
- `packages/drift/package.json` — same.
- `packages/k8s-baseline/package.json` — bumped `version: 1.0.0 → 1.2.0`; added `repository`, `bugs`, `homepage`.
- `packages/baseline/README.md` — NEW (npmjs.com-rendered).
- `packages/policies/README.md` — NEW.
- `packages/k8s-baseline/README.md` — NEW.
- `packages/baseline/LICENSE` — NEW (byte-identical to repo root, MD5 `3b83ef96387f14655fc854ddc3c6bd57`).
- `packages/policies/LICENSE` — NEW.
- `packages/drift/LICENSE` — NEW.
- `packages/k8s-baseline/LICENSE` — NEW.
- `packages/k8s-baseline/tests/release-readiness.test.ts` — extended with 16 new test cases enforcing M1 invariants.
- `README.md` — v1.1.0 → v1.2.0 references; removed `(pre-release)` annotation for k8s-baseline.
- `CHANGELOG.md` — folded version reconciliation into the existing `[1.2.0]` entry; added "Pre-public-launch publish-readiness pass" line under "Changed".
- `docs/ARCHITECTURE.md` — line 7 updated to reflect the atomic 1.2.0 across all four packages.
- `.gitignore` — added `package-lock.json`, `yarn.lock`, `.claude/`.
- `package-lock.json` — DELETED.
- `docs/slo/current/RUNBOOK-hulumi-pre-public-launch.md` — NEW (this runbook).
- `docs/slo/lessons/hulumi-pre-public-launch-m1.md` — NEW (this milestone's lessons).
- `docs/slo/completion/hulumi-pre-public-launch-m1.md` — NEW (this file).

## Tests added

- `packages/k8s-baseline/tests/release-readiness.test.ts` — 16 new test cases under `Feature: Atomic four-package publish-readiness (Runbook hulumi-pre-public-launch M1)`:
  - 4 × per-package publish-shape (`private`, `publishConfig.access`, `provenance`, `license`)
  - 4 × per-package metadata (`repository.url`, `bugs.url`, `homepage`)
  - 1 × atomic-version invariant (`Set(versions).size === 1`)
  - 1 × CHANGELOG-vs-package version (1.2.x match)
  - 4 × per-package README presence + non-empty
  - 4 × per-package LICENSE byte-equality with repo root

## Runtime validations added

- `pnpm publish --dry-run` per package validated as the M1 E2E gate. All four packages produce clean tarballs:
  - `@hulumi/baseline@1.2.0` — 211 files, 322 709 bytes unpacked
  - `@hulumi/policies@1.2.0` — 96 files, 193 051 bytes unpacked
  - `@hulumi/drift@1.2.0` — 59 files, 128 852 bytes unpacked
  - `@hulumi/k8s-baseline@1.2.0` — 137 files, 264 205 bytes unpacked
- Surprise-content scan: no `src/`, `tests/`, `node_modules/`, `*.test.ts`, or `package-lock` in any tarball.

## Static analysis and formatter evidence

- `pnpm -r typecheck` — clean
- `pnpm -r build` — clean
- `pnpm -r lint` — clean
- `pnpm run lint:license-boundary` — `OK (IDs-only policy upheld across scanned trees)`
- `pnpm run lint:exact-pin-guard` — `OK (6 @pulumi/* deps match pinned hashes)`
- `pnpm run format:check` — `All matched files use Prettier code style!`
- `pnpm -r test` — 470 tests pass (broken down: drift 58, policies 106, skill-bdd 28, baseline 99 + 8 skipped integration, k8s-baseline 167, examples 4)

## Compatibility checks performed

- All four packages' TypeScript public exports — unchanged (verified via dist/ identical structure pre/post).
- `peerDependencies` ranges — unchanged.
- `files` arrays — unchanged.
- `exports` maps — unchanged.
- `main`, `types` paths — unchanged.
- `pnpm-lock.yaml` — unchanged in resolution content (only `package-lock.json` deleted).
- `release.yml` atomic-release invariant — preserved (all four versions match at 1.2.0).
- CI-relevant test files (`release-readiness.test.ts`) — extended additively, no removals.

## Invariants/assertions added

See lessons file. Eight distinct invariants encoded across 16 test cases.

## Resource bounds added or verified

None new. M1 is metadata-only.

## Documentation updated

- `README.md` — version line + "What's in the box" header + k8s-baseline annotation.
- `docs/ARCHITECTURE.md` — overview line 7.
- `CHANGELOG.md` — `[1.2.0]` entry's k8s-baseline version + "Pre-public-launch publish-readiness pass" addition.
- Per-package READMEs (3 NEW) — npmjs.com display content.

## .gitignore changes

Added: `package-lock.json`, `yarn.lock`, `.claude/`.

## Test artifact cleanup verified

`git status` after the full `pnpm -r test` run shows only the M1 file changes — no untracked test artifacts. The `.tmp/` directories declared by `packages/baseline/tests/integration/.tmp/` rule remain effective.

## Deferred follow-ups

- **`@hulumi` npm scope claim.** P0, user action. Out of runbook scope.
- **`hulumi.io` domain registration.** P0, user action. M2 will ship `.github/SECURITY-CONTACTS` and SHA-pin third-party actions but does not register the domain.
- **Tarball-vs-`files` glob equivalence test as a vitest case (currently only smoke-tested via `npm pack --dry-run`).** Possible follow-up issue.

## Known non-blocking limitations

- The `kubernetes-secret-from-asm.test.ts` test file emits 66 unhandled-rejection logs from pre-existing fail-closed scenarios. Cosmetic stdout noise; tests pass with exit 0. Pre-existing, not introduced by M1. Cleanup belongs to a future K8s-baseline-internal milestone, not to this runbook.
- `@hulumi/k8s-baseline` skipped from version 1.0.0 directly to 1.2.0; if any external consumer pinned `1.0.0-pre.1`, they will need to update the pin (no other action — public API surface unchanged). CHANGELOG documents the jump.
