# Integration testing roadmap

**Status as of v1.2.0 (runbook `hulumi-pre-public-launch` M3)**: this
doc is the contract for the remaining real-AWS integration tests. The
AccountFoundation sandbox lane now has a real Pulumi Automation API
up/assert/destroy smoke test. The drift-classify lane now has one
real-AWS S3 console-drift proof with cache-hit verification. The stronger
AWS API polling assertions, Startup-Hardened lane, failure-injection
cleanup scenario, and remaining drift real-AWS scenarios remain separate
runbook work (`hulumi-integration-real-aws`, candidate for the v1.3 train).

> Why a roadmap and not implementation? The sandbox-AWS deploy rig is a
> 200–400 LOC undertaking per scenario, requires a configured Pulumi
> backend + AWS access + a stable cleanup invariant, and takes 5–15
> minutes per test run. Authoring it in the same milestone as four
> unrelated public-launch hygiene fixes was the wrong shape; this doc
> carves it off cleanly.

---

## What lives where

| Test file                                                                    | Status                                           | Roadmap section                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------ |
| `packages/baseline/tests/integration/account-foundation.integration.test.ts` | sandbox smoke implemented; `it.todo` ×2          | [#account-foundation](#account-foundation) |
| `packages/drift/tests/integration/drift-classify.integration.test.ts`        | S3 console-drift smoke implemented; `it.todo` ×2 | [#drift-classify](#drift-classify)         |

Both files keep one always-on `it()` that asserts the
`HULUMI_INTEGRATION=1` skip-gate is in place. That gate is a regression
target; if a future change lands a real test that runs unconditionally,
the gate-invariant catches it.

---

## Common harness requirements

Anything that lands real-AWS coverage will need:

1. **Pulumi backend** in the workflow runner. Prefer
   `PULUMI_BACKEND_URL` as a repository secret for self-managed S3
   state; `PULUMI_ACCESS_TOKEN` remains an optional Pulumi Cloud
   alternative. The workflow refuses both at once.
2. **Sandbox-AWS OIDC role.** Already wired
   (`aws-actions/configure-aws-credentials`, SHA-pinned in M2).
3. **Stack lifecycle**: `pulumi up` → wait → assert → `pulumi destroy`.
   Cleanup must run on both success and failure paths (`afterEach` /
   `try-finally`). Pulumi Automation API exposes this via
   `LocalWorkspace` + `Stack.up()` + `Stack.destroy()`.
4. **AWS API polling** for resource readiness — every poll bounded by
   an explicit timeout, every retry budget-bounded.
5. **Tag invariant**: every fixture stack tags resources with
   `hulumi:iac-role=true` so the classifier sees them as IaC-managed.
6. **Test artifact cleanup**: after the test run, no Pulumi
   checkpoints / `.pulumi/` directories leak into the working tree.
   The existing `.gitignore` already covers `packages/baseline/**/.pulumi/`
   and `packages/baseline/tests/integration/.tmp/`; new tests must
   honour those paths.
7. **Open-source safety**: no static credentials, no public ingress,
   no public S3 buckets, no public repos, no public sandbox account
   identifiers, and no full state export in logs. The sandbox role
   should use
   `docs/deployment/weekly-integration-iam-policy.json`, not
   administrator access.

---

## Account-foundation

### Test 1 — Sandbox tier: smoke implemented; AWS API polling still pending

**Current implementation**:

- `packages/baseline/tests/integration/account-foundation.integration.test.ts`
  creates a short-lived inline Pulumi Automation API stack when
  `HULUMI_INTEGRATION=1`, `HULUMI_TIER=sandbox`, one Pulumi backend is
  configured, and `HULUMI_IAC_ROLE_ARN` is set.
- The test runs `Stack.up()`, asserts real provider outputs for
  CloudTrail, Config, GuardDuty, Security Hub, and the four KMS keys,
  then always calls `Stack.destroy()` and `removeStack()` in `afterAll`.
- The test suppresses Pulumi output so logs do not print state, account
  identifiers, or backend details.

**Remaining target**: all 6 sub-resources reach ACTIVE within 15 minutes;
teardown succeeds.

**Pre-conditions**:

- `PULUMI_BACKEND_URL` or `PULUMI_ACCESS_TOKEN` configured
- AWS OIDC role assumed (sandbox account)

**Stack shape**: a Pulumi program that imports `@hulumi/baseline` and
constructs:

```ts
new AccountFoundation("integration-test", {
  tier: "sandbox",
  iacRoleArn: process.env.HULUMI_IAC_ROLE_ARN!,
  region: "us-east-1",
});
```

**Expected sub-resources** (per `docs/components/account-foundation.md`):

1. CloudTrail trail with multi-region + log-file validation
2. Config recorder + delivery channel
3. GuardDuty detector (status: ENABLED)
4. SecurityHub subscription (status: SUBSCRIBED)
5. IAM password policy (status: applied)
6. KMS key with rotation enabled

**Polling**: for each sub-resource, poll the AWS API until status is the
expected value, with a per-resource timeout of 5 minutes (capped at
15 min total wall-clock).

**Verdict**: every sub-resource reports the expected state within the
budget, then `pulumi destroy` runs to completion without orphan
resources.

**Cleanup invariant**: even if any assertion throws, `Stack.destroy()`
runs in a `finally` block. The post-test `git status` shows a clean
working tree.

**Wall-clock estimate**: 12–15 minutes per run.

### Test 2 — Startup-Hardened tier

Same shape as Test 1, with `tier: "startup-hardened"`. Asserts the 6
sub-resources from Test 1 PLUS the tier-specific extended set
(currently: GuardDuty extended features, SecurityHub PCI standard,
expanded IAM password policy). Reuse the polling helpers from Test 1.

**Wall-clock estimate**: 15 minutes per run.

### Test 3 — Teardown runs on failure (force-fail variant)

Deliberately trigger a stack-up failure (e.g. by passing an invalid
KMS key alias that fails at apply time), then assert that
`Stack.destroy()` still runs and removes whatever sub-resources DID
make it ACTIVE before the failure.

**Wall-clock estimate**: 5–8 minutes per run.

---

## Drift-classify

### Test 1 — console drift detected: `ConsoleBreakGlass/high` after deliberate mutation by non-IaC principal

**Current implementation**:

- `packages/drift/tests/integration/drift-classify.integration.test.ts`
  creates one short-lived Pulumi-managed S3 bucket when
  `HULUMI_INTEGRATION=1` and one Pulumi backend is configured.
- The test mutates bucket tags through the AWS SDK, waits for the
  CloudTrail `PutBucketTagging` event, classifies the bucket with
  `DriftClassifier`, and expects `ConsoleBreakGlass / high`.
- The same test calls `classify()` a second time inside the cache TTL
  and asserts the adapters/probe were not called again.
- `afterAll` always runs `Stack.destroy()`, removes the Pulumi stack, and
  deletes the local Pulumi work directory.

**Remaining target**: broader fixture coverage for non-S3 resources and
failure-injection teardown.

**Pre-conditions**:

- Sandbox Pulumi stack containing a single `SecureBucket` already
  deployed (or deployed as part of the test setup)
- AWS API access via a non-IaC principal (different from the IaC role
  that deployed the bucket)

**Mutation**: as the non-IaC principal, modify a tag on the SecureBucket
(e.g. `aws s3api put-bucket-tagging --bucket <name> --tagging '{...}'`)
or change a permission. This emits a CloudTrail event tagged with the
non-IaC principal's ARN.

**Wait**: CloudTrail event delivery latency is region-dependent
(typically 1–5 minutes). Poll the bucket's history until the event
appears.

**Expected verdict**: `DriftClassifier.classify()` returns
`{ source: "ConsoleBreakGlass", confidence: "high" }`.

**Cleanup**: the deliberate mutation is reverted as part of teardown.
The IaC stack is destroyed.

**Wall-clock estimate**: 5–8 minutes per run.

### Test 2 — provider-version drift detected: `ProviderApiChurn/medium`

**Pre-conditions**: stack pinned to an OLDER `@pulumi/aws` than the
latest published version. The provider-version adapter compares pinned
vs latest from the npm registry.

**Verdict**: classifier returns
`{ source: "ProviderApiChurn", confidence: "medium" }`. The medium
confidence ceiling is TLA+-proven (per `HulumiDrift.tla`).

**Wall-clock estimate**: 2 minutes per run (mostly local + one npm
registry call; minimal real AWS required).

### Test 3 — cache survives within TTL

After Test 1's verdict is computed and cached (in
`.hulumi/drift-cache/*.json`), call `classify()` a second time within
the TTL. Verify zero AWS API calls happen in the second invocation
(use a recording mock or count CloudTrail Lookup invocations).

**Wall-clock estimate**: 1 minute per run.

### Test 4 — teardown runs on failure: fixture removed even if classify throws

Force `classify()` to throw mid-execution (e.g. via a probe-timeout).
Assert the test fixture (deployed bucket + IAM role) is still cleaned
up via `pulumi destroy`.

**Wall-clock estimate**: 3–5 minutes per run.

---

## Acceptance criteria for the follow-up runbook

When `hulumi-integration-real-aws` ships:

- [ ] The AccountFoundation sandbox smoke is extended with AWS API
      polling for all 6 expected sub-resources.
- [ ] The remaining 6 `it.todo()` slots above are replaced with real
      implementations.
- [ ] All 7 tests gated on `HULUMI_INTEGRATION=1` (skip-gate preserved).
- [ ] All 7 tests run cleanly in the weekly workflow.
- [ ] Total wall-clock for the weekly workflow stays under 60 minutes.
- [ ] No orphan resources after a full success-path run.
- [ ] No orphan resources after a failure-injection run.
- [ ] `tests/skill-bdd/` retains the `it.todo`-counter regression that
      catches a future stub re-introduction.

---

## Why this shape

The audit framing was: "tautological tests masquerading as coverage."
There are two honest fixes:

1. **Implement the real test.** Best long-term — but a 1–2 week
   workstream that wasn't in scope for the public-launch hygiene
   pass.
2. **Make the gap explicit.** `it.todo()` reports as `todo` in vitest,
   not `passed`. A reader who runs `pnpm -r test` sees the gap
   immediately. A future PR that drops the `todo` without filling in
   the implementation also fails review.

M3 chose option 2 for `#21` + `#24` and option 1 for `#26` (cooling-off
diff) and `#30` (SCP teardown). The latter two were small enough to
ship in this milestone; the former two carve cleanly into a future
runbook tracked here.
