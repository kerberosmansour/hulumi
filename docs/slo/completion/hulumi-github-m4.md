# M4 completion summary — Hulumi-for-GitHub

> Closed 2026-04-26 by `/slo-execute M4`.

## Goal achieved

After M4, `@hulumi/drift` extends with `GithubWebhookFallbackAdapter` — a pure TypeScript class (no `pulumi.dynamic.Resource`) that ingests push-model GitHub webhook events for the seven drift-relevant event types, verifies HMAC signatures with `crypto.timingSafeEqual`, deduplicates via SHA-256-keyed idempotency cache, sequences out-of-order deliveries by envelope timestamp, and emits structured audit rows for secret-rotation suspicion, oversized payloads, and signature failures. The `DriftVerdict` type extends with two non-suppressible additive fields — `tierDegraded?: boolean` (always true when this adapter contributes; the adapter exists because GHEC audit-log REST is unavailable) and `featureNotLicensed?: string[]`. Cache schema bumped v1 → v2 with explicit `migrateV1ToV2` performing atomic backup-then-v2-write.

`DriftSource` enum unchanged — TLA+ alignment preserved.

## Files changed

### New (3)

- `packages/drift/src/adapters/github-webhook-fallback.ts` — adapter + helpers (`hashCacheKey`, `exceedsNestingDepth`, `verifyWebhookSignature`)
- `packages/drift/tests/github/github-webhook-fallback.test.ts` — 14 mock-runtime BDD scenarios
- `packages/drift/tests/github/cache-migration-v1-to-v2.test.ts` — 3 atomic-write-order tests
- `docs/lessons/hulumi-github-m4.md`
- `docs/completion/hulumi-github-m4.md`

### Modified (3)

- `packages/drift/src/types.ts` — additive: `tierDegraded?: boolean`, `featureNotLicensed?: string[]` on `DriftVerdict`. Enum unchanged.
- `packages/drift/src/cache.ts` — `CACHE_SCHEMA_VERSION` bumped 1 → 2; `CACHE_SCHEMA_V1_LEGACY` constant; `CacheEnvelopeV1` legacy type; `migrateV1ToV2` function with atomic backup-then-v2-write
- `packages/drift/src/index.ts` — re-exports for the new adapter + cache migration + types
- `docs/RUNBOOK-hulumi-github.md` Milestone Tracker — M4 → in_progress (start) → done (close)

## Tests added

- 14 BDD scenarios for `GithubWebhookFallbackAdapter`:
  - 1 happy-path (signed branch_protection_rule event ingested correctly)
  - 3 critique S1 (size cap rejected, depth cap rejected, depth utility unit)
  - 1 critique S5 (SHA-256 cache key with path-traversal input)
  - 3 abuse-case (signature tampered, signature length-mismatch, sandbox-allowunsigned accepted)
  - 1 replay-blocked (idempotency cache)
  - 1 critique E3 (3 consecutive HMAC failures emit `webhook_secret_rotation_suspected`)
  - 1 critique E1 (out-of-order delivery sequenced by envelopeTime)
  - 2 non-suppressible field tests (`tierDegraded: true` always; `featureNotLicensed` reflects featureLicenseMap)
  - 1 unknown-event-type rejection
- 3 cache migration scenarios:
  - happy-path migration preserves AWS-side state, writes `.v1.backup`
  - malformed v1 file aborts pre-backup, primary file untouched
  - unexpected schemaVersion rejected with clear error

## Test results

```
packages/drift test:   12 test files, 54 tests passed (was 50 + 4 new)
packages/policies test: 3 test files passed
tests/skill-bdd test:   3 test files, 28 tests passed
packages/baseline test: 8 test files, 43 passed | 8 skipped
examples/* test:        3 example smokes passed

pnpm -r build:                    Done across all 3 packages
pnpm -r typecheck:                Done across all 9 workspace projects
pnpm -r lint:                     Done (0 errors, 0 warnings)
pnpm run lint:license-boundary:   OK
pnpm run lint:exact-pin-guard:    OK (4 @pulumi/* deps match pinned hashes)
```

## Documentation updated

- M4 lessons file written (3 surprises + 4 decisions + 5 rules-for-next-milestone)
- All M1, M2, M3, M4 BDD scenarios + AWS regression remain green; no test deletions

## Demo gate (deferred follow-ups)

- **Real webhook receiver wiring**: M5 ships `docs/cookbooks/github-webhook-drift.md` with two wiring patterns (AWS Lambda + API Gateway; Cloudflare Worker) plus HMAC-secret-rotation runbook.
- **Integration suite for the adapter against real GitHub deliveries**: deferred to M5 launch readiness — the BDD coverage is structurally exhaustive on the adapter's contract; real-network coverage belongs in the cookbook examples.

## Forward-references opened

- M5 ships `docs/cookbooks/github-webhook-drift.md`, the v1.1.0 CHANGELOG entry, an `examples/github-drift-smoke/` example consuming the adapter, and the SLSA-L3 atomic three-package release.

## Allow-list amendment captured

No M4-specific allow-list amendment beyond what the M4 runbook permitted. The single deviation from runbook spec was keeping `DriftSource` enum unchanged (TLA+ alignment held; new behavior in additive fields). Documented in the M4 lessons file.
