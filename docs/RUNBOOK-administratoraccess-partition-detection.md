# Runbook: AdministratorAccess partition detection

Status: confirmed by the user's standing instruction to continue autonomously with the SLO skills on defensive cybersecurity work.
Runbook ID: `administratoraccess-partition-detection`
Finding: `csf_6dc6685b80368670490947d5` — the shared detector recognizes only the commercial AWS managed `AdministratorAccess` ARN, so G_OIDC_2 and CIS 1.16 miss equivalent GovCloud and China grants.
Base: `10d3704dcf43dcaf28b559b2566d8a244d0edd93`
Data classification: IAM policy ARNs and Pulumi resource metadata are internal configuration; no credentials or customer data are handled.

## 1. Architecture and provider evidence

AWS identifies resources with `arn:<partition>:<service>:<region>:<account-id>:<resource>`. Its IAM documentation names `aws`, `aws-cn`, and `aws-us-gov` as the supported partitions, and IAM resource ARNs omit the region. AWS documents commercial `AdministratorAccess` as `arn:aws:iam::aws:policy/AdministratorAccess`; its GovCloud guide uses `arn:aws-us-gov:iam::aws:policy/AdministratorAccess` for the same AWS managed policy. China uses the same ARN structure with the documented `aws-cn` partition.

The shared IAM helper is the single recognition boundary. It must accept only these three exact strings:

- `arn:aws:iam::aws:policy/AdministratorAccess`
- `arn:aws-us-gov:iam::aws:policy/AdministratorAccess`
- `arn:aws-cn:iam::aws:policy/AdministratorAccess`

G_OIDC_2 must call that helper for direct policy values as well as arrays. CIS 1.16 already calls the helper, so it receives the repaired behavior without duplicating partition logic.

## 2. Security contract

| Contract item       | Decision                                                                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Goal                | Detect the AWS managed full-administrator policy identically in commercial, GovCloud, and China partitions.                                                      |
| Threat              | A GitHub-OIDC role or general IAM attachment in a non-commercial partition receives full account authority while mandatory policy checks remain silent.          |
| Invariant           | Every supported attachment shape rejects an exact AWS managed `AdministratorAccess` ARN in any documented AWS partition.                                         |
| Exactness           | Customer-account policy ARNs, unknown partitions, different policy names, suffixes, prefixes, whitespace, embedded strings, and non-string entries do not match. |
| Compatibility       | Keep `AWS_ADMINISTRATOR_ACCESS_ARN` exported with its existing commercial value; broaden only the predicate used by G_OIDC_2 and CIS 1.16.                       |
| Failure behavior    | Policy evaluation remains deterministic, local, bounded, and secret-free. Malformed values produce no exception and no false match.                              |
| Dependency contract | No dependency, manifest, lockfile, version, publication, or live AWS change.                                                                                     |

## 3. M1 — cover all documented AWS partitions

Started: 2026-10-15
Refactor budget: one shared predicate, its G_OIDC_2 caller, two focused test files, the G_OIDC_2 operator document, and SLO evidence.

### Allowed files

- `docs/RUNBOOK-administratoraccess-partition-detection.md`
- `docs/slo/critique/administratoraccess-partition-detection-m1.md`
- `docs/slo/verify/administratoraccess-partition-detection-m1.md`
- `docs/slo/lessons/administratoraccess-partition-detection-m1.md`
- `docs/slo/completion/administratoraccess-partition-detection-m1.md`
- `packages/policies/src/aws/iam-policy.ts`
- `packages/policies/src/github/g-oidc-2.ts`
- `packages/policies/tests/github/g-oidc-2.test.ts`
- `packages/policies/tests/cis-v5-pack.test.ts`
- `docs/components/g-oidc-2.md`

### BDD acceptance

| ID       | Given/when                                                                                                                                                 | Then                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| BDD-M1-1 | G_OIDC_2 sees a GovCloud or China `AdministratorAccess` policy on a supported role/attachment shape                                                        | it emits one mandatory violation for the linked GitHub-OIDC role |
| BDD-M1-2 | CIS 1.16 sees a GovCloud or China `AdministratorAccess` policy on a supported attachment shape                                                             | it emits one mandatory violation                                 |
| BDD-M1-3 | the predicate receives an exact commercial, GovCloud, or China ARN as a scalar or array member                                                             | it returns true                                                  |
| BDD-M1-4 | the predicate receives a customer-account ARN, unknown partition, suffix/prefix, whitespace variant, embedded value, different policy, or non-string entry | it returns false without throwing                                |
| BDD-M1-5 | existing commercial, customer-managed full-admin, inline full-admin, scoped-policy, and EKS scenarios run                                                  | their behavior remains unchanged                                 |
| BDD-M1-6 | package/workspace/security gates run                                                                                                                       | all pass with no dependency graph or out-of-scope diff           |

### Execution sequence

1. Run the official pinned OSV gate over both resolved lockfiles and the full graph; run the 57-test focused baseline.
2. Add partition and exactness scenarios. Preserve the expected RED failures for GovCloud and China before implementation.
3. Replace literal commercial-only comparisons with the shared exact three-partition predicate.
4. Run focused and package tests, build, typecheck, lint, formatting, workspace regressions, OSV, Semgrep, secret review, allow-list, and diff hygiene.
5. Sign and DCO-stamp the exact source commit, pass exact-head CI, merge only the pinned head under standing authorization, and run xhigh Codex Security on the exact merged-main commit.

### Forbidden shortcuts

- No substring, suffix-only, case-insensitive, whitespace-trimming, arbitrary `aws-*`, customer-account, or wildcard ARN match.
- No suppression, severity downgrade, rule-ID change, broad IAM parser refactor, new dependency, live AWS call, or fabricated evidence.
- No claim that this syntactic rule computes effective IAM authority; customer-managed full-admin documents remain covered only when their document or exact in-stack dependency is inspectable.

### Definition of done

All BDDs and existing regressions pass; the exact-head PR is green and merged; and an exact merged-main scan no longer reports the partition-local `AdministratorAccess` blind spot or an equivalent occurrence.
