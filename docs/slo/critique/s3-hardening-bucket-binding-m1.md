# SLO critique — S3 hardening control-to-bucket binding M1

Runbook: `docs/RUNBOOK-s3-hardening-bucket-binding.md`
Date: 2026-10-15
Threat-model mode: degraded. This bounded CrossGuard repair has no frozen component-specific `.slo.json`; the abuse ID is defined in the runbook and no schema-stability claim is made.

## CEO pass

| id  | persona | category     | runbook section | finding                                                                                         | concrete scenario                                                                    | recommendation                                                                                             | resolution                                                 |
| --- | ------- | ------------ | --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| C1  | CEO     | reduce-scope | Out of scope    | Reworking every policy-pack relationship check would delay a confirmed mandatory-policy bypass. | A broad CrossGuard graph library prevents a small HULUMI-H5 fix from reaching users. | Repair the five S3 control bindings first and schedule other relationship findings as separate milestones. | accepted under standing autonomous maintenance instruction |

## Engineering-lead pass

| id  | persona          | category | runbook section | finding                                                                                                            | concrete scenario                                                                               | recommendation                                                                                                                           | resolution          |
| --- | ---------------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| E1  | engineering lead | ask      | Compatibility   | Existing unit fixtures omit dependency edges even though the real SecureBucket passes outputs into control inputs. | Requiring real graph evidence makes synthetic fixtures fail until they model Pulumi accurately. | Update the genuine fixture once, use it across controls, and document the test-contract change.                                          | accepted            |
| E2  | engineering lead | auto-fix | Binding helper  | Repeating dependency traversal in five checks risks inconsistent property names.                                   | The policy check requires `policy`, while the other controls require only `bucket`.             | Add one exact-property dependency helper and pass the required property list per control.                                                | applied to contract |
| E3  | engineering lead | ask      | Unknown values  | Physical IDs can be unknown in preview and logical names are not stable authority.                                 | A value-only equality rule either guesses or rejects a legitimate preview.                      | Use property dependency URNs as the primary identity proof and keep values only for hardening-shape and policy-resource coverage checks. | accepted            |

## Security pass

| id  | persona  | category | runbook section      | finding                                                                                                                                             | concrete scenario                                                                                                                   | recommendation                                                                                          | resolution               |
| --- | -------- | -------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------ |
| S1  | security | ask      | Security contract    | **Severity: high — CWE-706.** The rule merges logical name, physical name, and ID, then accepts any equal candidate under type-chain-only ancestry. | A second hardened bucket uses the victim's logical name as its physical name and all of its controls exempt the unprotected victim. | Remove logical-name candidates and require exact per-property dependencies on the victim bucket URN.    | accepted; primary repair |
| S2  | security | ask      | Bucket policy        | A correct `bucket` property edge does not prove that the JSON policy document embeds the same bucket ARN.                                           | The policy targets the victim in `bucket` but its TLS Deny covers a second bucket.                                                  | Require both `bucket` and `policy` property edges, then retain exact bucket/object ARN coverage checks. | accepted                 |
| S3  | security | ask      | General dependencies | `dependsOn` expresses ordering and can be forged without using a bucket output as the target property.                                              | A decoy control sets a constant target and adds the victim to general dependencies.                                                 | Do not accept general `dependencies` as HULUMI-H5 binding evidence.                                     | accepted                 |
| S4  | security | auto-fix | Negative proof       | A single crossed-name test may miss missing edges on individual controls.                                                                           | PAB is fixed while SSE or versioning still uses string equality.                                                                    | Add table-driven tests for all five control classes plus the policy's second required edge.             | applied                  |

### Expanded finding S1

- **Severity: high; CWE-706.** Caller-controlled names are resolved as if they were causal resource identity.
- **Provider evidence:** Pulumi's Policy SDK exposes dependencies per property; Inputs derived from Outputs create those tracked dependencies, while `dependsOn` is a separate general ordering mechanism.
- **Threat link:** `tm-hulumi-h5-cross-bucket-binding`; eliminated when only exact target-bearing property edges can attribute a control to a bucket.
- **Variant analysis:** crossed logical/physical names, duplicate value candidates, same type chain across component instances, no dependency, general-only dependency, wrong bucket URN, policy `bucket` edge without `policy` edge, malformed policy, and genuine output-derived controls.
- **Remediation proof:** focused RED/GREEN BDDs, complete package/workspace regression, exact-head CI, and exact merged-main Codex Security rescan.

## Design pass

Skipped: no UI surface.

## Critique decision

M1 remains one bounded defensive milestone. The user's standing instruction authorizes execution. The nine-file allow-list does not overlap the active trusted-node release task, official Pulumi documentation supports the graph distinction, and implementation may proceed BDD-first with no new dependency.
