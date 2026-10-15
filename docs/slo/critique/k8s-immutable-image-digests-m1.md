# Critique — Kubernetes immutable image digests M1

The repository has no frozen `.slo.json` threat model for this pre-existing rule, so the security pass operates in documented degraded mode and makes no stable abuse-ID claim. The user's standing instruction to continue autonomously with defensive SLO work confirms this bounded milestone and disposes the concrete `ask` rows as accepted.

| id  | persona          | category     | runbook section | finding                                                                                                                                          | concrete scenario                                                                                              | recommendation                                                                                                                 | disposition |
| --- | ---------------- | ------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| C1  | CEO              | reduce-scope | Red lines       | Querying registries would turn a deterministic preview gate into a networked provenance product with credentials and availability failure modes. | Preview blocks because a registry is offline or authenticates to the wrong tenant.                             | Validate the reviewed reference grammar only; leave trusted digest resolution to build/release tooling.                        | accepted    |
| C2  | Engineering lead | ask          | Compatibility   | Renaming the rule or export would create avoidable public API churn.                                                                             | Consumers importing `k8sWl3NoLatestImage` break even though the security behavior is otherwise compatible.     | Preserve the public identifier and export; update description and behavior in place.                                           | accepted    |
| C3  | Security         | ask          | BDD B1–B7       | **High — CWE-494:** ordinary tags can be repointed and are not content integrity evidence.                                                       | `registry/app:1.2.3` passes preview, the tag is later moved, and a subsequent deployment runs different bytes. | Accept only one canonical SHA-256 digest, reject malformed/unknown inputs, and stop echoing the full reference in diagnostics. | accepted    |
| C4  | Design           | defer        | Entire runbook  | The surface is a deterministic policy diagnostic with no visual UI.                                                                              | N/A.                                                                                                           | Skip visual design and keep the correction concise and actionable.                                                             | accepted    |

## Expanded security finding C3

- **Severity:** high.
- **Taxonomy:** CWE-494 Download of Code Without Integrity Check.
- **Reachability:** any protected workload or init container uses a registry tag without an exact digest.
- **Impact:** deployment can execute content different from the reviewed infrastructure input after a tag is repointed or a registry is compromised.
- **Class elimination:** require a canonical content-addressed `@sha256:` reference directly in the policy input.
- **Negative twin:** a tag may remain as human-readable metadata only when an exact digest follows and controls resolution.
- **Residual:** the policy does not prove who produced the digest, scan image contents, verify a signature/attestation, or contact a registry.

## Review conclusion

M1 eliminates the validated tag-repointing class at preview without adding network, dependency, or publication authority. The exact grammar, negative controls, and diagnostic redaction make the milestone specific enough for BDD-first execution.
