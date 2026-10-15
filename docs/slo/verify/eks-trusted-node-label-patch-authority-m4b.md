# Verification: EKS trusted-node label patch authority M4b

Date: 2026-10-16
Base revision: `e114dc29bad8f299a3614a4260a9ab1fcb0a27c3`
AgentBus task: `t2_mva67wo3_b67931fd-28d`
Local decision: pass; signed exact-head CI and merged-main xhigh Codex Security
remain ship gates.

## What was exercised

| Scenario          | Category              | How exercised                                                                                                                  | Result         | Evidence                                                                                                                                                          |
| ----------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pass 0            | Outcome validation    | Classified against the runbook contract.                                                                                       | not_applicable | M4b is a bounded security correction, not a new value-bearing capability.                                                                                         |
| BDD-M4b-1         | Authorization         | Pulumi mocks rendered both ClusterRoles and bindings.                                                                          | pass           | ServiceAccount binding has only Node `get/list`; the exact IAM group binding has only Node `patch`.                                                               |
| BDD-M4b-2         | IAM authentication    | Pulumi mocks rendered the STANDARD AccessEntry and Deployment dependencies.                                                    | pass           | The exact role ARN maps to one component group and `hulumi:trusted-node-label:<name>:{{SessionName}}`.                                                            |
| BDD-M4b-3         | Admission             | The rendered CEL expression was inspected through production component construction.                                           | pass           | The old ServiceAccount username is absent; both exact IAM prefix and exact group are required before the unchanged add/remove/no-piggyback checks.                |
| BDD-M4b-4         | Runtime happy path    | Adapter tests issued list/get/PATCH requests through production code.                                                          | pass           | Reads carried the projected token; PATCH called the provider once and carried a distinct IAM token.                                                               |
| BDD-M4b-5         | Deterministic signing | Fixed credentials, region, cluster and time were checked against an independently calculated URL/signature vector.             | pass           | Regional STS GetCallerIdentity URL, signed cluster header, session token, 60-second expiry, unpadded base64url and 4 KiB bound all match.                         |
| BDD-M4b-6         | Empty/degraded inputs | Missing or altered URI/token-file values, ambient relative URI/inline token and provider failure were injected.                | pass           | Credential retrieval was not called for invalid injection; all failures used the stable redacted error.                                                           |
| BDD-M4b-7         | Boundary inputs       | Undefined, empty, oversized, whitespace and control-character patch tokens were supplied.                                      | pass           | The adapter rejected each token before transport.                                                                                                                 |
| BDD-M4b-8         | Cross-layer runtime   | The existing local TLS journey used real CA/token files, Kubernetes HTTPS, AWS command objects, the kernel and patch receiver. | pass           | GETs used the file-backed projected token; PATCH used the different IAM token and the receiver observed only the exact M4a patch.                                 |
| BDD-M4b-9         | IAM trust             | Pulumi mocks parsed the exact trust policy.                                                                                    | pass           | Only `sts:AssumeRole` and `sts:TagSession` are allowed for `pods.eks.amazonaws.com`, constrained by exact cluster ARN, namespace and ServiceAccount request tags. |
| Regression matrix | Compatibility         | Focused, package and workspace commands exercised existing controller, kernel, component and unrelated workspace packages.     | pass           | Focused: 3 files / 19 tests. Package: 22 files / 292 tests. Workspace test/typecheck/build/lint all pass.                                                         |

## Runtime and failure assessment

Pass 1 covered successful role-token creation, rendered authorization and the
adapter-to-local-TLS mutation path. Pass 2 covered absent, malformed, foreign,
oversized and failing credential/token states. Pass 3 confirmed every exercised
partial failure stops before mutation and produces a stable authorization
failure. A real AccessEntry propagation delay cannot be created without a live
EKS cluster and is `not_applicable` to M4b by contract; M3 owns that operator-
gated qualification. The runtime already fails closed and signs again only on a
later fully re-attested cycle.

## Supply-chain and security verification

| Check                        | Result         | Evidence                                                                                                                                                                                                                                                                         |
| ---------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency admission         | pass           | Script-disabled lock-only resolution promoted two packages already present in the exact graph. No package identity, version, integrity or lifecycle script changed. Publisher/source, registry signatures/provenance and authority were reviewed before module execution.        |
| OSV / malicious package gate | pass           | Official checksum-pinned OSV-Scanner 2.7.0 scanned `pnpm-lock.yaml` (446 packages) and `tools/sca/package-lock.json` (129 packages): zero known vulnerabilities and zero `MAL-*`. JSON SHA-256 `b87e3bcfca95882531d039010d22f94d20b71e6b40345036cb310b32b4bbf2be`.               |
| Exact dependency pins        | pass           | `lint:exact-pin-guard` verified 16 exact manifest specifications with matching lockfile integrity hashes.                                                                                                                                                                        |
| SAST                         | pass           | Semgrep 1.156.0 ran 74 TypeScript/Node rules over four changed production files with zero findings/errors. JSON SHA-256 `dcec1ee9f75b28632410226a73b31fbec13b1c3629dae17669e21edc9f35ec99`.                                                                                      |
| Secret patterns              | pass           | Semgrep ran 41 applicable community secret rules over seven source/test files with zero findings/errors. JSON SHA-256 `eb4b6d001cfd8d34c201f7a4c0927e6f31972e1b1935e3d89b2a01b7e740eca1`.                                                                                        |
| Variant review               | pass           | No default provider-chain import, static AWS credential variable, `aws-auth` fallback, combined ServiceAccount read/write role or old ServiceAccount admission exception exists in production. The only fatal log receives stable redacted IAM/adapter messages on the new path. |
| IaC policy surface           | pass           | Pulumi render tests prove exact trust tags, one STANDARD AccessEntry, split ClusterRoles/bindings, exact group/username admission and workload dependency order.                                                                                                                 |
| DAST                         | not_applicable | This milestone changes a library/controller and cloud manifests; it adds no HTTP smoke service or OpenAPI route.                                                                                                                                                                 |
| Container scan               | not_applicable | M4b builds and publishes no controller image; digest image construction and scanning remain M3 gates.                                                                                                                                                                            |
| SBOM/provenance              | not_applicable | No release artifact is produced in M4b. Dependency provenance was reviewed at admission.                                                                                                                                                                                         |
| AI tolerance                 | not_applicable | No AI component.                                                                                                                                                                                                                                                                 |
| Measurement                  | not_applicable | M4b does not change the existing metric contract.                                                                                                                                                                                                                                |

The final repository OSV report is byte-identical to the admitted candidate
report. OSV proves absence of reported advisories in its current database; it
does not prove absence of unknown malicious behavior.

## Bugs found

No runtime or security defect was found during `/slo-verify`. The implementation
phase's first lint run identified one control-character regex lint violation and
one missing Node URL import in the new tests; both were corrected before this
verification began and the full gates were rerun.

## Environment

- macOS Darwin 25.5.0 arm64
- Node.js 24.14.0
- pnpm 9.12.0
- Vitest 4.1.11
- Semgrep 1.156.0
- OSV-Scanner 2.7.0

## Coverage gaps and residuals

- No live EKS, registry or CloudWatch mutation was performed. M3 must qualify
  `API`/`API_AND_CONFIG_MAP`, the Pod Identity Agent, AccessEntry propagation,
  rolling replacement, scale from zero and the coordinated digest image.
- A principal already authorized to admit another Pod under the exact
  controller ServiceAccount can receive the same Pod Identity credentials.
  Namespace workload admission and operator governance own this accepted risk.
- Exact-head GitHub checks and the merged-main xhigh Codex Security report are
  required before final completion and AgentBus closure.
