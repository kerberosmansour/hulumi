# Verification Report — eks-trusted-node-label-reconciler Milestone 1

## Scope and highest-authority outcome gate

Pass 0: **N/A — not value-bearing.** M1 is an unexported, side-effect-free
decision kernel. It creates no controller, AWS client, Kubernetes mutation path,
operator journey, or released artifact. Live end-to-end qualification belongs to
M3 after M2 supplies bounded adapters and authority.

## What was exercised

| Scenario | Category | How exercised | Result | Evidence |
| --- | --- | --- | --- | --- |
| BDD-1 fresh attestation and one-label patch | happy path | Called `planTrustedNodeLabel` with matching Node, EKS, ASG and EC2 snapshots; asserted all four exact JSON Patch operations. | pass | Focused Vitest: 17/17. |
| BDD-2 forged kubelet metadata | authorization abuse | Supplied expected ordinary node-group/type labels while removing independent ASG membership. | pass | `membership_missing`; no patch. |
| BDD-3 foreign/ambiguous/unhealthy identity | degraded and hostile states | Varied ASG identity and membership, account, region, AZ, instance type/state, ordinary labels and taints. | pass | Every variant returned its stable deny reason. |
| BDD-4 stale local Node | concurrency | Changed UID, resourceVersion and provider ID after planning; also inspected emitted test operations. | pass | Local validation rejected each change and the patch binds all three fields. |
| BDD-5 noop and conflict | authorization abuse | Exercised expected existing value, expected value on an unattested Node, and a conflicting protected value. | pass | Full attestation precedes noop; conflict denied. |
| BDD-6 rolling replacement | partial provider transition | Used fresh UPDATING evidence containing old/new allowed ASGs, then removed the only membership. | pass | Exactly one membership accepted; absence denied. |
| BDD-7 zero capacity | empty state | Classified desired/observed pairs for zero, waiting, reconciling, ready and invalid. | pass | `zero_capacity` is distinct from `awaiting_nodes`. |
| BDD-8 time and shape bounds | boundary/security | Varied stale/future/skewed timestamps, malformed provider ID, ASG count and unprotected label key. | pass | Every invalid case denied without an exception or patch. |

## Pass 4 — defensive security evidence

| Bundle / check | Result | Evidence |
| --- | --- | --- |
| Bundle B authorization and abuse tests | pass | BDD-2 through BDD-6 execute production kernel functions and cover CWE-269/CWE-345/CWE-362 boundaries. |
| Semgrep SAST | pass | Semgrep OSS 1.156.0, auto registry, 210 applicable rules over the two new TypeScript files, 0 findings. SARIF SHA-256 `fa8f0a16b262dd7b5abe601702e284c977242df51d6a042e06698384eb9e7c8f`. |
| OSV dependency graph | pass | Repository gate used official checksum-verified OSV-Scanner 2.7.0; 2 resolved lockfiles / 567 packages, 0 vulnerabilities and 0 `MAL-*`. JSON SHA-256 `f3c6d39b7395f8d529d6283b8b81ea5608c4b25d5052734155ba9eadc011ed64`. |
| Dependency admission | pass | `package.json` and `pnpm-lock.yaml` have no diff. Existing exact lock graph was installed offline with lifecycle scripts disabled. |
| DAST | N/A | Pure library kernel; no HTTP route, OpenAPI surface, smoke service or controller exists in M1. |
| Container/IaC policy | N/A | M1 creates no image, manifest, IAM, RBAC, admission resource or cloud resource. M2 owns those checks. |
| SBOM/provenance | N/A | M1 is internal and unexported; no artifact is published. |

Pass 5: **N/A — no AI component.**

Pass 6: **N/A — not a value-bearing milestone and no telemetry is emitted.**

## Compatibility and quality gates

| Command | Result |
| --- | --- |
| `pnpm --filter @hulumi/k8s-baseline test -- tests/trusted-node-label-reconciler-core.test.ts` | pass, 17 tests |
| `pnpm --filter @hulumi/k8s-baseline test` | pass, 18 files / 232 tests |
| `pnpm --filter @hulumi/k8s-baseline typecheck` | pass |
| `pnpm --filter @hulumi/k8s-baseline lint` | pass |
| `pnpm --filter @hulumi/k8s-baseline build` | pass |
| `pnpm run format:check` | pass |

The pre-implementation baseline was 17 files / 215 tests. The first focused run
failed because the production module did not exist, which is the required red
test evidence. No manifest, lockfile, package export or existing source file
changed.

## Bugs found

| id | severity | scenario | regression test | status |
| --- | --- | --- | --- | --- |
| None | N/A | No unexpected runtime behavior remained after the red/green implementation cycle. | N/A | closed |

## Environment

- macOS 26.5.2 (25F84), arm64.
- Node.js 24.14.0; pnpm 9.12.0; Vitest 4.1.11; TypeScript 5.9.3.
- OSV-Scanner 2.7.0; Semgrep OSS 1.156.0.
- Dependency installation used `--frozen-lockfile --ignore-scripts --offline`.

## Coverage gaps and milestone limits

- Provider snapshots are typed caller inputs in M1. They are not proof that a
  runtime used AWS SDK results; M2 must own the adapters and prevent injection.
- Standard regional availability zones are supported by the provider-ID parser;
  Local Zone and Wavelength provider-ID forms need an explicit policy decision
  before runtime publication.
- AWS snapshot atomicity, throttling, retries and CloudTrail/audit correlation are
  unexercised until M2/M3.
- RBAC cannot constrain one label key. M2 requires an admission policy bound to
  the exact ServiceAccount and mutation shape.
- Live managed-node rolling replacement and scale-from-zero recovery remain M3
  qualification gates. No physical cluster behavior is claimed here.
