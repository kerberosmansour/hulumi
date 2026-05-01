# Lessons learned — Hulumi-for-GitHub M4

> Captured 2026-04-26 at the close of `/slo-execute M4`.

## Surprises

### 1. `DriftSource` enum is hard-locked by `tla-alignment.test.ts`

The M4 runbook design rule said the enum could gain `github-webhook-event` and `github-product-change` values without TLA+ re-verification. Reality: `tla-alignment.test.ts` has `expect(DRIFT_SOURCES).toEqual([...])` with the exact 6-value list. Adding values fails this test. The runbook author was right that the verdict-composition rules are unchanged — but the enum itself is also part of the locked surface.

**Fix**: kept the enum unchanged. The webhook-fallback adapter contributes signals that fold into the EXISTING `ConsoleBreakGlass` / `GenuineIacDrift` outcomes; new behavior is captured in additive `tierDegraded` + `featureNotLicensed` fields on `DriftVerdict` (not new enum values).

**Rule for the next milestone (M5)**: when M5 release notes describe M4 deliverables, document that `DriftVerdict` gained two optional fields BUT `DriftSource` enum is unchanged (and TLA+ re-verification is not owed).

### 2. `DriftAdapter.signal` window-polarity convention

The DriftAdapter interface declares `window: { before: string; after: string }` but doesn't document which is the upper / lower bound. The CloudTrail adapter uses `before` as the upper bound (more recent) and `after` as the lower bound. My initial GitHub adapter implementation had this reversed; tests caught it immediately because the `featureNotLicensed` and out-of-order tests both depend on events landing inside the window.

**Fix**: renamed the local variables to `upperTs` / `lowerTs` and added a comment. The contract is now clear at the call site.

**Rule for the next milestone (M5)**: when M5 cookbook samples wire webhooks into `DriftClassifier`, the example code documents the window polarity to head off the same confusion in user code.

### 3. `pulumi.dynamic.Resource` ban paid off

M4's adapter is a pure TypeScript class — no Pulumi resources, no closure serialization, no vitest worker-pool gotcha. All 14 BDD tests passed first-try (after the window-polarity fix). M3's lessons rule #2 ("never `pulumi.dynamic.Resource` in test paths") is the single highest-leverage rule from this runbook.

## Decisions

### Cache schema bump v1 → v2 with explicit migration

The M4 runbook spec said v1 → v2 with `.v1.backup` atomic write order. Implemented as `migrateV1ToV2(path)`:

1. read v1 file
2. write `<path>.v1.backup` with original bytes verbatim (mode 0o600)
3. construct v2 envelope (adds optional `githubWebhookCache: {}`)
4. atomic write to `<path>` with mode 0o600

Failure modes are loud — malformed v1 fails before the backup is written, so the operator can inspect the v1 file and retry. AWS-side tests confirm no regression on the existing readCache / writeCache paths under v2.

### `DriftVerdict.tierDegraded` and `featureNotLicensed` are non-suppressible

Per critique-derived constraints. The adapter's `signal()` always populates `tierDegraded: true` (the adapter exists _because_ GHEC audit-log is unavailable; the truth is constant). `featureNotLicensed` is populated from the user-supplied `featureLicenseMap` — only truthy entries appear in the output. There is no API flag to hide either field.

### Webhook secret-rotation detection at >3 consecutive failures

Per critique E3. The adapter tracks consecutive HMAC failures keyed on `(installationId, repoFullName)`. After 3 failures from the same source, it emits a structured `webhook_secret_rotation_suspected` audit row to stderr. The threshold is documented + exported as `ROTATION_FAILURE_THRESHOLD`. Successful HMAC verification resets the counter.

### Allow-list of 7 webhook event types

Per the M4 runbook spec: `branch_protection_rule`, `repository_ruleset`, `secret_scanning_alert`, `dependabot_alert`, `code_scanning_alert`, `member`, `organization`. Events outside this set are rejected with `unknown_event_type`. M5 may extend the list (e.g. `push` for SLSA Source Track L4 work) but only as an explicit additive change with corresponding cookbook updates.

## Deltas from plan

- **`DriftSource` enum unchanged** (M4 runbook design rule was wrong; the enum is locked by tla-alignment.test.ts). New behavior expressed via additive fields on `DriftVerdict`.
- **All 14 BDD scenarios in pure mock-runtime** (no integration suite added — webhooks are user-wired infrastructure, exercised in M5 cookbook smoke tests).
- **No `pulumi.dynamic.Resource` anywhere** — followed M3 lessons rule #2 to the letter.

## Rules for the next milestone (M5)

1. **Document the additive-only nature of M4's `DriftVerdict` changes** in the v1.1.0 CHANGELOG: `tierDegraded?: boolean` and `featureNotLicensed?: string[]` are optional, no consumer break.
2. **Document the cache schema bump** in the v1.1.0 CHANGELOG: migration runs automatically on first read; `.v1.backup` preserved one rotation; old AWS-only consumers still work because `verdict` field is unchanged.
3. **Document the window polarity convention** in cookbook samples: `before` = upper bound (more recent), `after` = lower bound (earlier). Mirror the CloudTrail adapter's idiom.
4. **Document the `DriftSource` enum unchanged + TLA+ re-verification not owed** — this matters for v1.1 customers who track changes to verdict-composition behavior.
5. **Cookbook for wiring webhook events into the adapter** lands in M5 (`docs/cookbooks/github-webhook-drift.md`). Two wiring patterns: AWS Lambda + API Gateway, Cloudflare Worker. HMAC secret rotation runbook step is the load-bearing UX content.
