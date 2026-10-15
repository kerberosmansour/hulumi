# Critique: EKS trusted-node label patch authority M4b

Reviewed contract: `docs/slo/current/RUNBOOK-eks-trusted-node-label-patch-authority-m4b.md`
Review mode: degraded threat-model read-side mode because no frozen
`eks-trusted-node-label-reconciler-threat-model.slo.json` exists; existing abuse
IDs are preserved manually without claiming schema-level ID stability.
Decision: proceed with the accepted amendments below. The user's standing
authorization to continue autonomous defensive work supplies the scope decision.

| id        | persona          | category | runbook section        | finding                                                                                                                                                                             | concrete scenario                                                                                                                                             | recommendation / resolution                                                                                                                                                                                               |
| --------- | ---------------- | -------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4B-CEO-1 | CEO              | ask      | Compatibility          | An AccessEntry requirement narrows the deployable cluster set and old images cannot patch after upgrade.                                                                            | An operator deploys M4b to a `CONFIG_MAP`-only cluster or keeps an M2 image, sees the controller running, and assumes trust restoration still works.          | Accepted: make `API`/`API_AND_CONFIG_MAP` and matching-image prerequisites explicit; AccessEntry creation fails rather than falling back, and alarms expose denied mutations.                                             |
| M4B-ENG-1 | Engineering lead | ask      | Token adapter          | A generic default credential chain can silently prefer static environment or profile credentials over Pod Identity.                                                                 | A copied `AWS_ACCESS_KEY_ID` in the Deployment causes EKS tokens to authenticate as an unrelated operator role with broader cluster access.                   | Accepted: depend directly on `@aws-sdk/credential-provider-http`, call only that provider after validating the exact Pod Identity URI/token-file contract, and never import the umbrella/default chain.                   |
| M4B-ENG-2 | Engineering lead | ask      | Rollout                | AccessEntry control-plane propagation is eventually consistent after Pulumi reports creation.                                                                                       | The first controller cycle starts immediately, receives 401/403 on PATCH and could cache that failure or reuse stale evidence.                                | Accepted: depend on the AccessEntry structurally, generate a fresh token and re-attest on each later bounded cycle, and document the initial fail-closed availability window.                                             |
| M4B-ENG-3 | Engineering lead | ask      | Cross-layer validation | Unit tests of a token string and RBAC manifests can pass while the adapter still sends the SA token on PATCH.                                                                       | Refactoring leaves one shared request helper that reads the projected token before selecting the HTTP method.                                                 | Accepted: the real local TLS journey must observe distinct authorization headers for GET/list and PATCH, with a fresh patch-token call count.                                                                             |
| M4B-SEC-1 | Security officer | ask      | Secure Value contract  | Replacing username-only admission with group-only admission would preserve a confused-deputy variant. CWE-269 / OWASP C1.                                                           | A second AccessEntry is accidentally assigned the same group and can invoke the trusted-label mutation path.                                                  | Accepted: admission requires both the exact component username prefix and exact group, in addition to exact mutation shape; variant pointer: identity alias/collision checks in the variant-analysis playbook.            |
| M4B-SEC-2 | Security officer | ask      | Pod Identity trust     | The generic `pods.eks.amazonaws.com` trust policy lets another association in the account use the role if configuration drifts. CWE-284 / OWASP C1.                                 | A different cluster or namespace associates the role and obtains credentials capable of authenticating to the target cluster.                                 | Accepted: bind exact `eks-cluster-arn`, namespace and ServiceAccount request tags while retaining only `sts:AssumeRole`/`sts:TagSession`; variant pointer: alternate-principal/path analysis.                             |
| M4B-SEC-3 | Security officer | ask      | Residual risk          | IAM-backed PATCH does not prove the caller is the one managed Deployment; any admitted Pod with the same ServiceAccount receives the same Pod Identity. CWE-269 / OWASP C1.         | A namespace actor creates a Pod with the reconciler ServiceAccount, receives role credentials and generates a valid EKS token.                                | Accepted residual: state this boundary explicitly, require namespace workload admission/governance operationally, and do not claim workload-instance attestation in M4b.                                                  |
| M4B-SEC-4 | Security officer | ask      | Token construction     | An IAM token that omits the signed cluster header or admits an arbitrary STS endpoint can authenticate in the wrong context or leak signed material. CWE-345 / OWASP C3.            | A configuration error signs a global/attacker-controlled host or leaves `x-k8s-aws-id` unsigned, and the Kubernetes verifier rejects or misbinds the request. | Accepted: derive only the regional partition STS host from the already validated region; sign `x-k8s-aws-id`, cap at 4 KiB and verify deterministic token structure. Variant pointer: parser/endpoint confusion analysis. |
| M4B-SEC-5 | Security officer | ask      | Dependency admission   | Promoting a transitive signer to a direct runtime dependency without rescanning can bypass the repository admission rule even when no package identity is new. CWE-1104 / OWASP C2. | The importer graph changes and a compromised replacement or lifecycle hook is accepted because the package already appeared elsewhere in the lock.            | Accepted: script-disabled candidate resolution, full OSV/MAL scan, exact integrity/publisher/source/lifecycle/graph review before install or test, and exact-pin protection.                                              |

## CEO pass

The scope is the smallest change that removes ServiceAccount-token-only mutation
authority. Live cluster qualification and namespace-wide workload admission are
kept out because adding them would mix a local security correction with M3
operator rollout. The stricter cluster prerequisite is a deliberate compatibility
change and must be visible in operator docs.

## Engineering-lead pass

The primary failure risks are credential-source ambiguity, access-entry
propagation and accidental shared-token plumbing. The runbook now makes each a
testable boundary. No separate broker or long-lived credential store is needed.

## Security pass

Bug class `CWE-269 Improper Privilege Management` is eliminated for a stolen
ServiceAccount token: that token keeps read authority and cannot satisfy IAM-group
PATCH RBAC. `CWE-345 Insufficient Verification of Data Authenticity` is mitigated
by the standard signed EKS token, exact cluster header and regional STS endpoint.
The admitted-same-ServiceAccount Pod variant remains residual and is assigned to
namespace workload admission/governance rather than mislabeled as eliminated.

Abuse case `tm-eks-node-label-reconciler-abuse-6` must be amended in the canonical
threat model before close-out. M4a's exact mutation, CAS and no-piggyback controls
remain defense in depth after the identity split.

## Design pass

Skipped: the milestone has no user-interface surface.

## Final gate

Proceed only after the direct-dependency candidate passes script-disabled
resolution, official pinned OSV/MAL scanning and provenance/integrity/lifecycle
review. The implementation must remain within the exact 18-file allow-list and
must capture failing BDD evidence before production code changes.
