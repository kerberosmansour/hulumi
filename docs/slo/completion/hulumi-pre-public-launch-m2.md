# Completion Summary — hulumi-pre-public-launch Milestone 2

## Goal completed

Four public-launch hygiene findings closed. Every workflow `uses:` line is SHA-pinned with tag-as-comment so a tag-rewrite attack on any upstream action repo cannot land in Hulumi CI; `.github/SECURITY-CONTACTS` ships, closing the SECURITY.md:23 forward reference; the sandbox AWS account ID is gone from the repo (lessons file + runbook); the four research-iteration scratch files are removed. The repo is one milestone closer to safe-to-flip-public.

## Files changed

- `.github/workflows/ci.yml` — 29 `uses:` lines SHA-pinned (`actions/checkout@v6` × 9, `actions/setup-node@v6` × 11, `pnpm/action-setup@v6` × 9).
- `.github/workflows/release.yml` — 8 `uses:` lines SHA-pinned (`actions/checkout@v6` × 2, `actions/setup-node@v6` × 2, `pnpm/action-setup@v6` × 2, `actions/attest-build-provenance@v4` × N, `actions/upload-artifact@v7` × N, `softprops/action-gh-release@v3` × 1).
- `.github/workflows/weekly-integration.yml` — 4 `uses:` lines SHA-pinned (`actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v6`, `aws-actions/configure-aws-credentials@v6`).
- `.github/workflows/pulumi-cooling-off.yml` — 2 `uses:` lines SHA-pinned (`actions/checkout@v6`, `actions/setup-node@v6`).
- `.github/SECURITY-CONTACTS` — NEW (k8s.io convention).
- `SECURITY.md` — line 23 updated to a working reference.
- `docs/slo/lessons/hulumi-m3.md` — line 42 sandbox account ID redacted to `123456789012` placeholder.
- `docs/slo/current/RUNBOOK-hulumi-pre-public-launch.md` — 5 references to the sandbox account ID redacted to `<sandbox-acct>`.
- `docs/slo/research/hulumi-github/.research-scratch-iter-{1,2,3,4}.md` — DELETED.
- `tests/skill-bdd/workflow-action-pinning.test.ts` — NEW (3 BDD scenarios).
- `CHANGELOG.md` — added M2 hygiene-pass entry under [1.2.0] "Changed".

## Tests added

- `tests/skill-bdd/workflow-action-pinning.test.ts` — 3 BDD scenarios:
  1. Every `uses:` line in `.github/workflows/*.yml` is SHA-pinned (40-char hex).
  2. Every SHA-pinned use carries a tag-as-comment.
  3. OIDC trusted publishing preserved — release.yml retains the registry-url; no workflow references NPM_TOKEN or NODE_AUTH_TOKEN as a secret/env.

## Runtime validations added

- The 3 BDD scenarios above ARE the runtime validation for M2 — they re-run on every CI run. A regression that drops a SHA-pin or reintroduces NPM_TOKEN fails CI immediately.
- Manual SHA-vs-upstream verification recorded in lessons (7 unique action+tag pairs verified via `gh api` round-trip; annotated-tag dereferenced for 3 of them).

## Static analysis and formatter evidence

- `pnpm -r typecheck` — clean
- `pnpm -r lint` — clean
- `pnpm run lint:license-boundary` — `OK`
- `pnpm run lint:exact-pin-guard` — `OK (6 @pulumi/* deps match pinned hashes)`
- `pnpm run format:check` — clean
- `pnpm -r test` — 473 tests pass (M1's 470 + 3 new workflow-action-pinning)

## Compatibility checks performed

- All workflow file SHAs verified against their upstream tags (recorded in lessons).
- No job-level `permissions:` block was modified.
- No `NPM_TOKEN` / `NODE_AUTH_TOKEN` references added.
- OIDC `registry-url: https://registry.npmjs.org` preserved in release.yml.
- DCO check active (no workflow file removed).
- license-boundary lint runs in CI.
- exact-pin-guard runs in CI.
- No workflow file renamed.
- M1 invariants still hold (release-readiness.test.ts green; 22 tests pass).

## Invariants/assertions added

- SHA-pin invariant: every `uses:` line in `.github/workflows/*.yml` matches `^\s*-?\s*uses:\s+[^@\s]+@[0-9a-f]{40}(\s+#\s+\S+)?\s*$`.
- Tag-as-comment invariant: every SHA-pinned use has a `# <tag>` comment.
- OIDC-preservation invariant: release.yml has `registry-url`; no workflow uses NPM_TOKEN/NODE_AUTH_TOKEN as a secret.

## Resource bounds added or verified

None new. M2 is mechanical.

## Documentation updated

- `SECURITY.md` — line 23 reconciled.
- `CHANGELOG.md` — M2 entry under [1.2.0].
- `docs/slo/lessons/hulumi-m3.md` — sandbox account ID redacted with annotation.
- `.github/SECURITY-CONTACTS` — NEW; documents the disclosure paths.

## .gitignore changes

None in M2 (M1 already added `package-lock.json`, `yarn.lock`, `.claude/`).

## Test artifact cleanup verified

`git status` after the full `pnpm -r test` run shows only the M2 file changes — no untracked test artifacts.

## Deferred follow-ups

- **`security@hulumi.io` mailbox status.** SECURITY-CONTACTS documents the address as `deferred-until-domain-registered`; the user must register `hulumi.io` and configure MX before that contact path is functional. Out of M2 scope.
- **PGP key publication.** SECURITY-CONTACTS records "no PGP at this time"; if/when a key is generated, the file's `pgp_keys` array gets the fingerprint.
- **Vitest test for SECURITY-CONTACTS YAML shape.** The file is verified by manual inspection in M2; a parse-and-assert test could be a future hygiene addition.
- **Repo-wide grep for `<sandbox-acct-redacted>` in git history (not just HEAD).** M2 grepped tracked files at HEAD; the redaction does not rewrite history. If history-rewrite is desired before the public flip, that's a separate workstream (out of scope).

## Known non-blocking limitations

- Annotated-tag actions (3 of 7) had to be dereferenced via a second `gh api` call. M4's pin-guard extension should encode the dereference logic so future SHA bumps don't re-derive it.
- The redaction is text-based, not history-rewriting. If the public-launch decision requires the account ID to never have appeared in git history, that's a `git filter-repo` exercise (separate workstream, not blocking M2).
