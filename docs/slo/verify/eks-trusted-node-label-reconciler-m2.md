# Verification Report — eks-trusted-node-label-reconciler Milestone 2

## Scope and highest-authority outcome gate

Pass 0: **pass.** The value-bearing path ran over the highest applicable local
layer chain. A real TLS server using an ephemeral certificate accepted requests
from the production Kubernetes HTTPS adapter, whose token and CA were re-read
from files. Real AWS SDK command objects produced bounded EKS, Auto Scaling and
EC2 attestations, the M1 kernel planned the change, the controller re-read the
Node, and the TLS receiver observed the exact JSON Patch. Pulumi mocks separately
rendered the deployable identity, RBAC, admission, workload and alarms. Live EKS
scheduling and CloudWatch delivery remain the explicitly operator-gated M3 layer.

## What was exercised

| Scenario | Category | How exercised | Result | Evidence |
| --- | --- | --- | --- | --- |
| `oc-eks-node-label-reconciler-1` | outcome | Ran file-backed projected credentials, a real local TLS Kubernetes API, production AWS adapters, the M1 kernel, current-Node validation and the HTTP patch receiver. | pass | One exact patch contained UID, resourceVersion and provider-ID tests plus the configured label addition. |
| `cuj-eks-node-label-reconciler-1` | critical journey | Rendered the component and exercised one complete local controller cycle through production adapter code. | pass | Dedicated Pod Identity, minimal Node RBAC, fail-closed admission, restricted Deployment, two alarms, successful patch and no raw credential in audit output. |
| BDD-M2-1 | happy path | Used complete exact provider results and one eligible Node. | pass | Patch receiver observed only the kernel's four operations. |
| BDD-M2-2 | degraded/hostile providers | Exercised partial ASG pages, repeated Kubernetes continuation tokens, unrequested EC2 data, provider failure, malformed configuration and bounded parsing. | pass | Each case failed closed and patched nothing. |
| BDD-M2-3 | concurrency | Changed resourceVersion after attestation and exercised patch rejection. | pass | The plan was discarded; the next attempt must begin a new cycle. |
| BDD-M2-4 | invalid construction | Supplied a mutable image, invalid label, unsafe interval and malformed environment. | pass | Construction/configuration failed before privileged children or clients were used. |
| BDD-M2-5 | least privilege | Inspected rendered IAM, Pod Identity, RBAC, admission, workload and alarms. | pass | AWS writes are limited to the metric namespace; Kubernetes authority is Node get/list/patch plus exact-mutation admission. |
| BDD-M2-6 | authorization abuse | Inspected the CEL rule for other identities, conflicting values and every ObjectMeta field around the sole label addition. | pass | Non-controller identities must preserve the protected key; the exact ServiceAccount cannot piggyback another Node mutation. |
| BDD-M2-7 | observability/redaction | Exercised success, denial, provider failure, stale plan and metric failure event shapes. | pass | Stable codes and a 16-hex UID digest are emitted; raw UID, provider ID and error contents are absent. |
| BDD-M2-8 | formal refinement | Ran init, naive and hardened TLC configurations. | pass | Init 1/1 state; naive violated `NoUnsafeWrite` at 17 distinct states; hardened exhausted 34 distinct / 115 generated states at depth 6 with all invariants intact. |
| M1 core regressions | capability regression | Re-ran forged evidence, conflicts, stale plans, rolling membership, zero capacity and the full package suite. | pass | `@hulumi/k8s-baseline`: 21 files / 248 tests. |

## Pass 4 — defensive security evidence

| Bundle / check | Result | Evidence |
| --- | --- | --- |
| Bundle A — configuration and response shape | pass | Environment values, Node objects, pagination tokens, provider collections and response sizes are bounded; malformed or extra evidence fails closed. |
| Bundle B — identity and authorization | pass | Pod Identity trust is only `pods.eks.amazonaws.com`; IAM is EKS/ASG/EC2 read plus namespace-scoped metric publication; RBAC is only Node get/list/patch; admission binds the exact ServiceAccount and mutation. |
| Bundle C — concurrency | pass | The current Node is re-read and validated before patch; JSON Patch tests UID/resourceVersion/provider ID; every rejection discards the plan. |
| Bundle D — supply chain | pass | Official checksum-verified OSV-Scanner 2.7.0 scanned 2 lockfiles / 574 package occurrences with 0 vulnerabilities and 0 `MAL-*`. Report SHA-256 `5f59dc13fec74db396cb91ed62d13d7c0ede9908933523368b8e3173ece6b57a`. |
| Bundle D — provenance and graph diff | pass | Four exact AWS clients add seven identities and remove none. All seven registry integrity values match the lock and none declares `preinstall`, `install` or `postinstall`. Review SHA-256 `ec131fcd028fd2c563ad5af71734846858438779224baec08cd5990c22bf2011`. |
| Bundle D — image admission | pass | Trivy rejected Node/Alpine 3.22 (97 findings), Node/Alpine 3.23 (13) and distroless Debian 13 (31). M2 ships no image recipe and accepts only a caller-supplied digest reference. |
| Bundle E — audit and metric redaction | pass | Tests prove stable allow-listed events/dimensions and no raw provider error, Node UID, provider ID, bearer token or authorization header. |
| Bundle F — exact runtime boundary | pass | Real local TLS plus production adapters reached only the M1 kernel patch; failure injection produced no alternate mutation route. |
| Semgrep SAST | pass | Semgrep OSS 1.156.0 ran 210 applicable rules over eight M2 source/test files with 0 findings and 0 errors. JSON SHA-256 `e0992d16a14782b3d8f19ff6074f46f4ab622f20373965ff04bba88160437f74`. |
| Secret-pattern scan | pass | Nineteen changed paths contained no AWS access-key, GitHub token or tracked private-key pattern. |
| Codex Security Cloud | pass | Pre-PR canonical query for Hulumi returned 0 `new`, 0 `triaged` and 0 `in_progress` findings. Exact-PR review remains a merge gate. |
| DAST | N/A | This is a controller/library surface with no exposed HTTP route, OpenAPI service or runnable smoke web service. |
| SBOM/release provenance | N/A | M2 publishes no image or package. Official image and coordinated publication evidence belong to M3. |

Pass 5: **N/A — no AI component.**

## Pass 6 — measurement

| Check | Result | Evidence |
| --- | --- | --- |
| Event presence | pass | `ReconcileDecisions`, `ReconcileFailures` and `MissingTrustedLabel` are constructed in one bounded namespace. |
| Telemetry masking | pass | Dimensions are only cluster and node-group; audit Node identity is a truncated SHA-256 digest. |
| Failure-path emission | pass | Provider, deny, stale-plan, patch and metric-publication failures emit stable events. |
| Live telemetry delivery | skipped | No live EKS/CloudWatch credential is required or used in M2; M3 owns alarm and log delivery evidence. |
| Replay tagging | N/A | No session replay exists. |
| Measurement-spec and template-injection checks | N/A | No generated measurement artifact or author-supplied template string exists. |

## Compatibility and quality gates

| Command | Result |
| --- | --- |
| Focused three-file Vitest run | pass, 16 tests |
| `pnpm build` | pass, full workspace |
| `pnpm test` | pass, full workspace; `@hulumi/k8s-baseline` 21 files / 248 tests |
| `pnpm typecheck` | pass, full workspace |
| `pnpm lint` | pass, full workspace |
| `pnpm run lint:exact-pin-guard` | pass, 13 exact manifest/lock integrity pins |
| `pnpm run lint:workflow-governance` | pass |
| `pnpm run format:check` | pass |

The pre-implementation package baseline was 18 files / 232 tests. The initial
red run produced three explicit missing-behavior failures. Final review added
two more red regression assertions for unrequested EC2 evidence and admission
piggyback metadata before the corresponding fail-closed fixes.

## Bugs found

| id | severity | scenario | regression test | status |
| --- | --- | --- | --- | --- |
| M2-V1 | medium | EC2 returned the requested instance plus an unrequested instance and the adapter ignored the extra record. | `BDD-M2-2: EC2 evidence containing an unrequested instance fails closed` | fixed; exact one-reservation/one-instance response required |
| M2-V2 | medium | The controller admission expression bound core metadata but did not explicitly compare every remaining ObjectMeta field. | BDD-M2-5 expression coverage over generateName, namespace, selfLink, generation, timestamps, deletion grace, annotations, owner references, finalizers and managed fields | fixed; every schema-exposed ObjectMeta field except the sole label delta is bound |

## Environment

- macOS 26.5.2 (25F84), arm64.
- Node.js 24.14.0; pnpm 9.12.0; Vitest 4.1.11; TypeScript 5.9.3.
- OSV-Scanner 2.7.0; Semgrep OSS 1.156.0; TLC 2.20 via the recorded checksum-pinned jar.
- Dependency installation used `--frozen-lockfile --ignore-scripts` only after admission passed.

## Coverage gaps and milestone limits

- No official controller image exists; all three examined bases were rejected.
- Kubernetes admission compilation and enforcement on a real EKS API server,
  Pod Identity credential delivery, rolling replacement, deliberate zero
  capacity, scale-from-zero and CloudWatch alarm delivery remain M3 gates.
- Local Zone and Wavelength provider IDs remain unsupported by explicit policy.
- The TLA+ result is a finite-bound safety proof; it does not prove liveness or
  provider availability.
