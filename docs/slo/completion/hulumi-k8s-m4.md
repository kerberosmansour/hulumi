# Completion summary — Hulumi-K8s M4 (`KubernetesSecretFromAwsSecretsManager` + `RdsCredentialSecret`)

## Status: `done` (2026-04-26)

## Changed files

```
packages/k8s-baseline/
├── src/
│   ├── kubernetes-secret-from-asm.args.ts    # NEW
│   ├── kubernetes-secret-from-asm.outputs.ts # NEW
│   ├── kubernetes-secret-from-asm.ts         # NEW — foundation + wrapper + pluggable fetcher seam
│   └── index.ts                              # re-exports for both components
├── tests/
│   ├── kubernetes-secret-from-asm.test.ts    # NEW — 10 BDD scenarios
│   ├── rds-credential-secret.test.ts         # NEW — 3 scenarios
│   └── setup.ts                              # mock for kubernetes:core/v1:Secret
└── package.json                              # add @aws-sdk/client-secrets-manager runtime dep

scripts/
└── exact-pin-guard.mjs                        # add @aws-sdk/client-secrets-manager pin
```

## Tests added

- 10 scenarios in the foundation test file: happy paths (2), invalid input refusals (4), missing-key warns (1), abuse cases (3 — JSON-bomb cap, error-path redaction, non-object refusal).
- 3 scenarios in the RDS wrapper test file: default mapping covers 6 keys, opt-in rename, regression-locked default-mapping shape.

Total: **69 tests passing** in the K8s package; 0 failures; 0 skipped.

## Repo-wide regression sweep

| Check                            | Result                                             |
| -------------------------------- | -------------------------------------------------- |
| `pnpm -r build`                  | green (4 packages)                                 |
| `pnpm -r test`                   | green                                              |
| `pnpm -r typecheck`              | green                                              |
| `pnpm -r lint`                   | green                                              |
| `pnpm run lint:license-boundary` | OK                                                 |
| `pnpm run lint:exact-pin-guard`  | OK (6 deps pinned: 5 `@pulumi/*` + 1 `@aws-sdk/*`) |

## Issues closed

- [#40 — `SecureRds` extraction](https://github.com/kerberosmansour/hulumi/issues/40) → **closed** by the foundation + wrapper.

## Surface added (stable from M4)

- `@hulumi/k8s-baseline.KubernetesSecretFromAwsSecretsManager` + args + outputs + type constant.
- `@hulumi/k8s-baseline.RdsCredentialSecret` + args + outputs + type constant.
- `@hulumi/k8s-baseline.RDS_DEFAULT_KEY_MAPPING` (frozen const exposing the 6-key shape).
- `@hulumi/k8s-baseline.__setSecretsManagerFetcher` + `SecretsManagerFetcher` type (test seam — underscore-prefix marks "use in tests only").

## Implementation note (delta from runbook)

The runbook anticipated `pulumi.dynamic.Resource`. Implementation switched to inline apply with a pluggable fetcher factory; equivalent end-user behavior, dramatically simpler test seam. Recorded in lessons.

## Deferrals

- Kind integration test deferred to M5.
- Token-redaction regex coverage limited to GitHub + Bearer shapes; expansion as consumers report missed shapes (e.g., Slack `xoxb_`, Stripe `sk_`).

## Next milestone

M5 — `GitHubAppCredential` + shipped scripts + atomic four-package release.
