# Lessons Learned — hulumi-pre-public-launch Milestone 4

## What changed

- Extended `scripts/exact-pin-guard.mjs` ALLOWED with 5 new entries — `@aws-sdk/client-cloudtrail@3.1041.0`, `@aws-sdk/client-sts@3.1037.0`, `@aws-sdk/credential-providers@3.1041.0`, `p-timeout@7.0.1`, `simple-git@3.36.0`. These are `@hulumi/drift`'s runtime deps; pinning their integrity hashes catches a republish-with-tampered-bytes attack at CI.
- Enhanced `resolveFromLockfile` to handle both pnpm-lock.yaml shapes — quoted (`'@scope/pkg@ver':`) for scoped packages and bare (`pkg@ver:`) for unscoped. Initial implementation only handled the quoted form; the unscoped `p-timeout` and `simple-git` would have silently been "not found" without this change.
- Updated the pin-guard's status message from `(N @pulumi/* deps match pinned hashes)` to `(N pinned deps match expected integrity hashes)`. The original message was already inaccurate post-K8s runbook (the `@aws-sdk/client-secrets-manager` entry isn't `@pulumi/*`); now reflects the actual scope.
- Removed `packages/baseline/src/aws/probes/poll.ts`. Verified zero in-repo callers via `grep -rn pollUntil` over `packages/`, `skills/`, `examples/` (excluding `dist/` and the file itself). Removed the empty `probes/` directory implicitly when the file was deleted.
- Updated `docs/ARCHITECTURE.md` lines 56 + 170: dropped the row pointing at `probes/poll.ts` from the Key Components table; preserved the vitest-pool gotcha narrative on line 170 with an explicit note that the previous escape-hatch helper was removed in M4.
- Added `tests/skill-bdd/exact-pin-guard.test.ts` — 10 BDD scenarios covering subprocess success, ALLOWED entry presence (×5), poll.ts absence, ARCHITECTURE narrative, fail-closed branch presence (by source inspection), and the `@hulumi/*` exclusion from ALLOWED.
- CHANGELOG entry under [1.2.0] "Changed".

## Design decisions and why

- **Removed `poll.ts` rather than documenting.** Issue #28 said "document or remove"; the file was genuinely unused (zero imports, zero references except its own export and self-referencing error message). Documenting an unused file as "kept for future use" is a smell — git history preserves it if anyone needs the implementation later. Removing it eliminates a maintenance surface.
- **Pin-guard scope expanded to all transitive deps Hulumi publishes alongside.** The audit's framing was "exact-pin-guard for `@pulumi/*`", but the same defense-in-depth applies to any dep that's part of the four-package supply chain. After M4, pin-guard covers `@pulumi/*` (5), the K8s-baseline-shipping `@aws-sdk/client-secrets-manager` (1), and the drift-shipping `@aws-sdk/client-cloudtrail` + `@aws-sdk/client-sts` + `@aws-sdk/credential-providers` + `p-timeout` + `simple-git` (5) = 11 total.
- **`resolveFromLockfile` enhancement, not regex rewrite.** The script's existing `lock.indexOf(quotedHeader)` approach is simple and reliable; extending it with a fall-through to bare-header indexOf preserves the same shape. A regex-based rewrite would be more general but harder to audit. Kept the simple two-branch approach.
- **Bare-header anchored to a 2-space indent + leading newline + trailing newline.** A naive `pkg@ver:` indexOf would match `@aws-sdk/credential-providers/aws-sdk-client-cognito-identity@3.1041.0:` in a dependency block — wrong. The `\n  pkg@ver:\n` anchor keeps the match at top-level package entries only.
- **Status message change is small but load-bearing.** Future readers of the script's stdout shouldn't infer "this only protects @pulumi/\*". The new message is generic enough to remain accurate as ALLOWED grows.
- **BDD test inspects script source for ALLOWED entries, not behavior under tampered input.** Mutating `scripts/exact-pin-guard.mjs` mid-test to verify fail-closed semantics would interfere with other tests running in the same process. Source-inspection asserts the right code paths exist; behavior-under-tampering can be verified manually if ever needed.
- **`@hulumi/*` entries explicitly excluded from ALLOWED.** They're publish targets, not transitive deps. The BDD enforces this — a future contributor who adds `@hulumi/baseline` to ALLOWED would fail the test, which is the correct outcome.

## Assumptions verified

- `pnpm-lock.yaml` uses two distinct shapes for scoped vs unscoped packages. Verified by inspecting the file directly.
- `grep -rn 'pollUntil\|probes/poll\|from.*poll'` returns zero matches outside `poll.ts` itself. Verified.
- `pnpm -r build` + `pnpm -r typecheck` succeed after `poll.ts` removal. Verified — build is clean.
- The pin-guard's `process.exit(1)` branch is reachable from the integrity-mismatch path. Verified by source inspection (BDD test).

## Assumptions still unresolved

- **The `@aws-sdk/client-secrets-manager` entry comment-dates back to "Hulumi v1.2.0 M4 (Hulumi-for-K8s runbook)" but the actual prior addition predates this runbook.** Confusing because there are TWO M4s now — the K8s runbook's M4 (which added k8s-baseline's `@aws-sdk/client-secrets-manager`) and this runbook's M4 (which added drift's runtime deps). The comment is correct as written but reads as ambiguous. Could be clarified; not blocking.
- **`@hulumi/k8s-baseline` runtime deps (currently just `@aws-sdk/client-secrets-manager`) coverage is identical to drift's pattern.** If k8s-baseline ever adds more runtime deps, they should follow this same M4 pattern. Documented in the lessons.
- **Pin-guard does not cover the dev dependencies** (`vitest`, `typescript`, `prettier`, etc.). Those are not in the published tarballs, so a tampered version doesn't reach end users — but a tampered build-time dep COULD inject malicious bytes into the dist/. This is a different threat-model class (build-time trust) and out of M4 scope; would land as a separate workstream if pursued.

## Mistakes made

- **Initial `resolveFromLockfile` extension assumed all unscoped deps had bare headers.** Was right, but I didn't verify before assuming. A second iteration of "what if `p-timeout` is published as a scoped package now?" would have been wasted; checking the actual lockfile shape first was efficient.
- **Wrote the BDD test to assert ARCHITECTURE.md says "escape hatch" is GONE, but my initial regex was too loose — would have matched the surviving narrative line ("the previous escape-hatch helper was removed").** Caught when I re-ran the test post-edit and it failed; I'd written `not.toMatch(/escape hatch/)` instead of `not.toMatch(/escape hatch at.*probes\/poll\.ts/)`. Fixed immediately.

## Root causes

- **Test-vs-prose-narrative regex mismatch (recurring class from M2 + M3).** I keep writing regexes that are too tight or too loose for the prose they're checking against. Mitigation: when the BDD asserts a doc string is `not present`, also write a positive assertion that the surviving narrative IS present (catches over-tight not-match regexes).

## What was harder than expected

- Nothing significant. M4 was the smallest milestone in this runbook by file count and by judgment-call complexity.

## Invariants/assertions added or strengthened

- Pin-guard ALLOWED contains the 5 drift runtime deps (presence assertions).
- Pin-guard exits 0 against the current lockfile (subprocess assertion).
- `packages/baseline/src/aws/probes/poll.ts` does not exist (existsSync assertion).
- ARCHITECTURE.md preserves the vitest-pool gotcha narrative AND drops the escape-hatch pointer (positive + negative assertions).
- ALLOWED contains zero `@hulumi/*` entries (negative assertion preventing scope drift).

## Resource bounds established or verified

None new. M4 is mechanical.

## Debugging / inspection notes

- `grep -A1 -E "(p-timeout|simple-git)@[0-9]" pnpm-lock.yaml` is the right inspection for unscoped deps' integrity-hash extraction.
- `grep -rn pollUntil` is the canonical "is this function used?" inspection — but only after restricting to actual source dirs (`packages/`, `skills/`, `examples/`) and excluding `dist/`. Forgetting the dist/ exclusion can produce false positives from compiled .js+.d.ts copies of the same source.

## Naming conventions established

None new (M4 reuses M3's `tests/skill-bdd/<feature>.test.ts` convention).

## Test patterns that worked well

- **Source-inspection assertions** for "the script has X code path / X table entry / X comment". Faster + safer than mutating the script under test.
- **Positive + negative assertion pairs** when checking doc strings. Catches over-tight not-match regexes.

## Missing tests that should exist now

- **A vitest test that verifies the pin-guard's bare-header parsing handles edge cases** (e.g. a dep whose name contains `@` outside the version delimiter — though that shouldn't happen in npm). Considered for M4, deferred — current code is correct for all packages in the lockfile.
- **A test that walks every `dependencies` and `devDependencies` line in `packages/*/package.json` and asserts every runtime dep is either in ALLOWED or excluded with rationale.** Would catch the case where a future contributor adds a runtime dep without updating pin-guard. Considered; deferred to a follow-up — the `pnpm install --frozen-lockfile` + manual review at PR time is the current control.

## Rules for the next milestone (M5)

- **M5 is docs-only.** No script changes; no source removals; no test additions beyond doc-content invariants if any.
- **Read the M3 + M4 lessons before drafting** — both contain "test-vs-prose regex mismatch" notes.
- **The runbook is on its way to "done."** Be honest about scope creep — if M5 grows beyond a docs polish + migration plan, defer to a follow-up runbook.

## Template improvements suggested

- **The v4 template's "Files removed" row in the Contract Block could be a first-class field**, not folded into "Files allowed to change." M4 used a "Files removed" line as part of the table; would be cleaner as a dedicated row.
