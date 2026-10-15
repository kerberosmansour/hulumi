# Verification — S3 hardening control-to-bucket binding M1

Runbook: `docs/RUNBOOK-s3-hardening-bucket-binding.md`
Date: 2026-10-15
Base: `071232a246864316b5217fdfd24843e1eb0696fe`
Finding: `csf_2d48d1445109f7be71560655`

## Outcome evidence

| Contract                 | Evidence                                                                                                                               | Result                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `oc-s3-binding-1`        | Two exempted buckets cross the victim logical name with the hardened bucket's physical ID; controls depend on the hardened bucket URN. | The victim receives one HULUMI-H5 violation containing all missing controls; the hardened bucket passes. |
| `oc-s3-binding-2`        | Each PAB/SSE/ownership/versioning control is tested with equal target strings and its `propertyDependencies.bucket` edge removed.      | The corresponding hardening control is reported missing in every case.                                   |
| `oc-s3-binding-3`        | Every control receives the victim only through general `dependencies`; property dependencies are empty.                                | All five controls are rejected.                                                                          |
| `oc-s3-binding-4`        | The genuine fixture binds target-bearing control properties to the exact bucket URN; the policy binds both `bucket` and `policy`.      | No HULUMI-H5 violation is reported.                                                                      |
| ambiguity                | Bucket `props.bucket` and `props.id` disagree, or both physical identifiers are absent.                                                | The rule fails closed and never falls back to `PolicyResource.name`.                                     |
| policy resource coverage | Policy dependency edges are correct but its TLS Deny names a different bucket.                                                         | Only the TLS-only policy evidence is rejected.                                                           |

## BDD and regression evidence

| Phase           | Command or scope                                                                   | Result                                  |
| --------------- | ---------------------------------------------------------------------------------- | --------------------------------------- |
| Baseline        | focused HULUMI hardening test                                                      | 52/52 passed                            |
| RED             | focused suite after BDD additions, before implementation                           | 7 intended failures; 52 controls passed |
| GREEN           | `pnpm --filter @hulumi/policies test -- --run tests/hulumi-hardening-pack.test.ts` | 61/61 passed                            |
| Package         | `pnpm --filter @hulumi/policies test`                                              | 18 files, 395/395 passed                |
| Package compile | build, typecheck, lint                                                             | passed                                  |
| Workspace       | root build, test, typecheck, lint                                                  | passed across 19 runnable projects      |
| Governance      | format, license boundary, exact pins, workflow governance, diff check              | passed                                  |

The implementation accepts a control only when one physical bucket identity can be resolved from `props.bucket`/`props.id`, the control's `bucket` property depends on the exact bucket URN, and the existing control-shape check passes. Bucket policies additionally require their `policy` property to depend on that bucket and their TLS Deny to cover its bucket and object ARNs. Logical names and general `dependsOn` edges are never binding evidence.

## Dependency and security evidence

| Check           | Result                                                                                                                                                                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OSV admission   | Official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Dependency diff | No manifest or lockfile changed. The admitted workspace graph was restored from the local pnpm store with frozen lockfiles, lifecycle scripts disabled, offline mode, 422 packages reused, and zero downloaded.                                                                                                                            |
| Semgrep         | Semgrep 1.156.0 ran 110 effective rules (74 TypeScript and 36 multilang) over two changed TypeScript files with zero findings and zero errors; report SHA-256 `e5b63f5e39473cdc5b52f6d758920e35cf32b5c21b0629b0324491db988f6d1c`.                                                                                                          |
| Secret review   | Added lines matched zero high-confidence private-key, AWS access-key, GitHub-token, or OpenAI-key patterns. Fixtures contain bucket names and URNs only.                                                                                                                                                                                   |
| Scope           | All changed and SLO evidence files are within the exact nine-file AgentBus allow-list; the active trusted-node release task has no overlapping path.                                                                                                                                                                                       |

## Remaining closeout

- Create a signed+DCO commit and exact-head pull request.
- Require all GitHub checks, including OSV and CodeQL, to pass.
- Merge only the reviewed head under standing authorization.
- Run xhigh Codex Security against the exact merged-main commit and confirm the source finding and equivalent occurrence are absent.
