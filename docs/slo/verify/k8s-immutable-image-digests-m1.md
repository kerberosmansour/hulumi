# Verification — Kubernetes immutable image digests M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-k8s-immutable-image-digests.md`
Base: `23c877de8133299f55576a0b8f1486a9d35eb181`
Finding: `csf_96d255d71ece4e202037301b` / CWE-494
Verdict: local implementation and security gates passed; exact-head CI, merge, and merged-main Codex Security remain.

The repository has no frozen `.slo.json` threat model for this pre-existing rule. Verification therefore operated in documented degraded mode and makes no stable abuse-ID claim.

## What was exercised

| Scenario                            | Category          | How exercised                                                                                                                   | Result | Evidence                                                                                               |
| ----------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| `oc-k8s-immutable-image-digests-1`  | Pass 0 outcome    | Production WL-3 evaluated tag-only, canonical digest, tag-plus-digest, and malformed references through a protected Deployment. | pass   | Tag-only and malformed inputs produced mandatory violations; exact canonical references produced none. |
| `cuj-k8s-immutable-image-digests-1` | Pass 0 journey    | The focused suite models rejection of a version tag followed by successful preview after replacing it with the intended digest. | pass   | Both transition states exercise the production policy function.                                        |
| B1–B2                               | BDD               | Table-driven tests used semantic-version/arbitrary tags, no tag, `latest`, `edge`, empty, missing, and non-string inputs.       | pass   | Every non-digest input failed closed.                                                                  |
| B3                                  | Security boundary | Tests used truncated/overlong/uppercase digests, SHA-512, suffix garbage, whitespace, and multiple `@` separators.              | pass   | Every non-canonical grammar variant was rejected.                                                      |
| B4–B5                               | Negative controls | Tests used untagged and tagged canonical SHA-256 references, including a registry host port.                                    | pass   | All three canonical reference forms passed.                                                            |
| B6                                  | Resource coverage | A Deployment carried a safe application digest and tag-only init-container image.                                               | pass   | Exactly the init container was reported.                                                               |
| B7                                  | Data handling     | A private-looking registry reference was rejected and the diagnostic inspected.                                                 | pass   | The diagnostic named the container, URN, and digest requirement without copying the image reference.   |
| B8                                  | Regression        | Focused, runtime, package, workspace, OSV, and Semgrep gates were exercised.                                                    | pass   | Focused 42/42; runtime 2/2; policies 474/474; all 19 runnable workspace projects passed.               |

## RED/GREEN evidence

- Baseline focused suite: 27/27.
- RED: 15 intended failures and 27 passing controls. The failures covered ordinary tags, malformed digest variants, missing/uninspectable inputs, init containers, and diagnostic redaction.
- GREEN: 42/42 focused tests, 2/2 policy-pack runtime tests, and 474/474 policy-package tests.
- Package build, typecheck, and lint passed.
- All 19 runnable workspace projects passed topological build, typecheck, sequential tests, and lint.

## Security pass

| Gate                  | Result                                                                                                                                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OSV admission         | pass — official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged lockfiles and 575 package occurrences with zero vulnerability and zero `MAL-*` results; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`. |
| Dependency provenance | pass — no manifest or lockfile changed and no direct/transitive package, install hook, build script, or package authority was added.                                                                                                                 |
| Semgrep               | pass — Semgrep 1.156.0 ran 210 rules over the two changed TypeScript targets with zero findings and zero errors; report SHA-256 `c07fede0bb1423884f7d9f793cf37c00541471f793c9caa126c46a949f9df47a`.                                                  |
| Secret review         | pass — the implementation removes the full image value from diagnostics; added lines contain no credential, token, private key, or assigned secret.                                                                                                  |
| DAST                  | N/A — this deterministic Pulumi preview policy exposes no HTTP service or OpenAPI surface.                                                                                                                                                           |
| Container execution   | N/A — no image was pulled, built, started, or scanned as an artifact; this milestone validates only the declarative reference.                                                                                                                       |
| AI tolerance          | N/A — no AI component.                                                                                                                                                                                                                               |
| Measurement           | pass locally — all grammar partitions and resource arrays are covered; the lagging merged-main scan remains a closeout gate.                                                                                                                         |

## Bugs found

| id                                       | severity | scenario                                                                                             | regression test                                                                         | status                                         |
| ---------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `csf_96d255d71ece4e202037301b` / CWE-494 | high     | A semantic-version tag passes WL-3 even though the registry can later resolve it to different bytes. | `packages/policies/tests/k8s/hulumi-k8s-hardening-pack.test.ts` canonical-digest matrix | fixed locally; exact-main confirmation pending |

## Environment

- macOS arm64, Node.js/pnpm repository toolchain, Vitest 4.1.11.
- Production TypeScript policy functions were exercised through Pulumi `ResourceValidationPolicy` inputs; no registry or cluster credentials were used.

## Coverage gaps and residual limits

- A digest pins content identity but does not prove publisher identity, signature/attestation validity, vulnerability status, license, or runtime safety.
- Trusted build and release workflows must resolve and scan the intended multi-architecture manifest before supplying its digest.
- This milestone does not add Patch-resource coverage or expand the existing bounded workload-type inventory.
- OSV covers known vulnerabilities and malicious-package advisories; it does not prove the absence of unknown malware.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and merge only that verified head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm the finding and equivalent tag-repointing bypasses are absent.
