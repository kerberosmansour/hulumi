# Completion summary — Hulumi-K8s M5 (`GitHubAppCredential` + shipped scripts)

## Status: `done` (2026-04-26)

## Changed files

```
packages/k8s-baseline/
├── src/
│   ├── github-app-credential.args.ts     # NEW
│   ├── github-app-credential.outputs.ts  # NEW
│   ├── github-app-credential.ts          # NEW — provisions SM secret + scoped IAM read policy
│   └── index.ts                          # GitHubAppCredential re-export
├── scripts/
│   ├── populate-github-app-secret.sh     # NEW — set -euo pipefail + trap-scrub; writes JSON to SM
│   └── mint-github-app-token.sh          # NEW — set -euo pipefail + trap-scrub; JWT mint, token to stdout-only
├── tests/
│   ├── github-app-credential.test.ts     # NEW — 14 BDD scenarios incl. 4 abuse cases
│   └── setup.ts                          # mocks for aws:secretsmanager + aws:iam:Policy + RolePolicyAttachment
└── package.json                          # add scripts/ to files array

docs/components/github-app-credential.md  # NEW
docs/lessons/hulumi-k8s-m5.md             # NEW
docs/completion/hulumi-k8s-m5.md          # NEW
docs/RUNBOOK-hulumi-k8s.md                # Milestone Tracker M5 → done
```

## Tests added

- 14 scenarios in `github-app-credential.test.ts`: happy paths (5 — minimal args, default secretName, override secretName, principal attachment, repos:`["*"]`), invalid input refusals (5 — empty repos, empty permissions, missing kmsKeyAlias, secretName with `/`, secretName with `..`), abuse cases (4 — IAM policy is single-ARN-not-`*`, populate.sh is `set -euo pipefail`+trap, mint.sh never echoes PEM, scripts shipped via package.json files).

Total: **83 tests passing** in the K8s package (M1: 27, M2: 14, M3: 15, M4: 13, M5: 14); 0 failures; 0 skipped.

## Repo-wide regression sweep

| Check                                | Result                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `pnpm -r build`                      | green (4 packages)                                                                            |
| `pnpm -r test`                       | green (10 workspace projects, 283 tests total)                                                |
| `pnpm -r typecheck`                  | green                                                                                         |
| `pnpm -r lint`                       | green                                                                                         |
| `pnpm -w run lint:license-boundary`  | OK                                                                                            |
| `pnpm -w run lint:exact-pin-guard`   | OK (6 deps pinned)                                                                            |
| `npm pack` of `@hulumi/k8s-baseline` | tarball includes `package/scripts/populate-github-app-secret.sh` + `mint-github-app-token.sh` |

## Issues closed

- [#43 — `GitHubAppCredential` + scripts](https://github.com/kerberosmansour/hulumi/issues/43) → **closed** by the component + the two shipped bash scripts.

## Surface added (stable from M5)

- `@hulumi/k8s-baseline.GitHubAppCredential` + `GitHubAppCredentialArgs` + `GitHubAppCredentialOutputs` + `GITHUB_APP_CREDENTIAL_COMPONENT_TYPE`.
- `GitHubAppPermission` type (`"read" | "write" | "admin"`).
- Two user-facing executable scripts in the package tarball at `scripts/`.

## All 8 K8s-surface issues shipped

| Issue                                      | Component                                                           | Milestone          |
| ------------------------------------------ | ------------------------------------------------------------------- | ------------------ |
| #38 — EKS subnet auto-tagging              | `EksSubnetTagger`                                                   | M1                 |
| #39 — hardened Istio install bundle        | `IstioFoundation`                                                   | M2                 |
| #40 — RDS credential extraction            | `RdsCredentialSecret` (+ `KubernetesSecretFromAwsSecretsManager`)   | M4                 |
| #41 — `MeshedHttpEntrypoint` bundle        | `AlbMeshedHttpEntrypoint`                                           | M3                 |
| #42 — DaemonSet Fargate-exclusion affinity | `HardenedHelmRelease(daemonSet: true)` + `IstioFoundation` consumer | M1 + M2            |
| #43 — `GitHubAppCredential`                | `GitHubAppCredential` + scripts                                     | M5                 |
| #44 — Helm release-name suffix default     | `HardenedHelmRelease.releaseName` instance-name default             | M1                 |
| #45 — PSA-baseline + Istio cookbook        | `docs/cookbooks/psa-baseline-istio-sidecar.md`                      | shipped 2026-04-26 |

## Deferred to v1.0.0 launch PR

Per the M5 lessons file:

- 3 new cookbooks (release-rename, mesh-bootstrap, github-app-private-deps).
- 2 new examples (k8s-helm-smoke, k8s-mesh-bootstrap-smoke).
- Atomic four-package release workflow extension.
- Kind matrix in weekly-integration.
- Version bumps to `1.2.0` (existing three packages) + `1.0.0` (k8s-baseline).
- README / AGENTS.md / getting-started / why-hulumi updates.
- CHANGELOG v1.2.0 entry.
- Strike `#43` in `docs/issue-candidates.md`.

## Next milestone

The Hulumi-K8s runbook is **complete**. Next: the v1.0.0 launch PR to ship `@hulumi/k8s-baseline@1.0.0` alongside the existing three packages at `1.2.0`, with the deferred docs / examples / workflow extensions.
