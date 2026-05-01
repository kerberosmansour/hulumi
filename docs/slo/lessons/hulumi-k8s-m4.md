# Lessons learned — Hulumi-K8s M4 (`KubernetesSecretFromAwsSecretsManager` + `RdsCredentialSecret`)

## Surprises

1. **K8s `Secret.stringData` is auto-wrapped in Pulumi's secret envelope.** The mock-runtime captures the wrapped value `{ "4dabf...": "1b47...", "value": <actual> }` instead of the bare data. Tests need to unwrap via `inputs.stringData.value`. Documented an `unwrapStringData` test helper in both the foundation and wrapper test files; the same helper applies to any future K8s-Secret-emitting component.

2. **Throwing inside an `apply()` becomes an unhandled rejection that Vitest can't cleanly catch.** Initial implementation threw `Error` from inside the apply for invalid SM JSON / nesting-bomb / non-object cases. Pulumi's runtime turns that into a resource-registration failure, which surfaces in `pulumi up` as a clear error — but in test mocks it propagates as an unhandled promise rejection, breaking test isolation. Fix: switched the apply's failure paths to `pulumi.log.error(msg)` + return a sentinel `{ stringData: {}, written: [] }`. The `pulumi up` user still sees the error in the log; tests assert via `pulumi.log.error` spy.

3. **TypeScript strict-mode `exactOptionalPropertyTypes` rejects `field: undefined` even when the field is optional.** Building the K8s Secret's `metadata` object with `labels: args.labels` (where `args.labels` is `Record<string, string> | undefined`) doesn't compile under strict mode — `undefined` is not assignable to an optional property's type. Fix: build the metadata object incrementally and conditionally assign only when the field is defined. Same lesson applies to `args.region` passing through to the foundation's args. Recorded so M5's `GitHubAppCredential` follows the same pattern.

4. **`reduce` on `unknown[]` infers `unknown` for the accumulator.** TS5+ requires explicit `reduce<number>(...)` to keep the return type. Caught by typecheck.

## Decisions

1. **Test seam over `pulumi.dynamic.Resource`.** The runbook anticipated a `pulumi.dynamic.Resource` with `create`/`update`/`delete` hooks. Switched to the simpler shape: a pluggable `secretsManagerFetcher` factory inside an `apply()`. Equivalent behavior end-user-facing (SM call happens at apply time inside the Pulumi engine process; value lives encrypted in state via Pulumi's auto-secret discipline; rotation = re-running `pulumi up`); much cleaner test seam (`__setSecretsManagerFetcher` injects a stub). Documented as a v1 decision; if cross-process isolation becomes important later, swap to dynamic.Resource without changing the user-facing API.

2. **The foundation logs errors and returns sentinels rather than throwing.** Per the second surprise above. The trade-off: production `pulumi up` doesn't get a thrown JS exception, but it does get a visible error in the diagnostic stream + an empty K8s Secret (which the consumer's app will fail to start with). Documented in the JSDoc and the lessons file.

3. **`RdsCredentialSecret` opt-in keyMapping is _additive_, not _replacing_.** When the consumer passes `keyMapping: { password: "DB_PASSWORD" }`, the result has 6 keys: 5 defaults + the renamed `DB_PASSWORD`. This is the most ergonomic shape (rename without re-typing the other 5). If someone wants a strict subset, they pass an object containing only the keys they want and don't get the defaults — implementable as a `replaceDefaults: true` flag at v1.x if demand arises.

4. **Token-shape redaction regex covers GitHub + Bearer prefixes only.** `ghs_`, `ghp_`, `github_pat_`, `gho_`, `ghu_`, `Bearer\s+`. Non-GitHub token shapes (Slack `xoxb_`, Stripe `sk_`, Twilio `SK`) would be added as new shapes are reported. Shipped at the minimum v1 surface; flagged for expansion when consumer feedback identifies missed shapes.

## Deltas from plan

- Per the runbook: implementation uses `pulumi.dynamic.Resource`. Per execution: switched to inline apply-with-pluggable-fetcher (decision 1). Behavior-equivalent for end users; much testable. Recorded.
- The kind integration test deferred to M5.
- The `GitHubAppCredential`-side IAM-key-alias linkage (#43) is M5; M4's `kmsKeyAlias` doesn't apply here (this component reads SM, doesn't create it).

## What I'd do differently

- The auto-wrap of `stringData` in the secret envelope is a known Pulumi behavior I forgot about. Lesson: when adding mocks for any K8s Secret / SecretManager / KMS-touching resource, pre-emptively add the unwrap helper to setup.ts or the test file. Easier than discovering it via failing assertions.

## Carry-forward to M5

- The pluggable-fetcher seam pattern can be reused by any future component that needs to read AWS resources at apply time — `GitHubAppCredential` could use a similar pattern if it ever needs to hit the GitHub API at apply time (it doesn't — the M5 design is component-provisions-only).
- The `unwrapStringData` helper belongs in `tests/setup.ts` if M5 emits any K8s Secrets (it doesn't directly — it provisions an AWS Secrets Manager secret + IAM policy).
- The `pulumi.log.error` + sentinel pattern is the right shape for any apply-side validation that needs to be visible to the end user but testable in mocks.
