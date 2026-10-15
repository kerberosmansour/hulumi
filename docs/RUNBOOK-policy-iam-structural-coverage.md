---
runbook_version: 4
id: hulumi-policy-iam-structural-coverage
prefix: policy-iam-structural-coverage
issues: [codex-security]
stack: Node.js 24, TypeScript 5, Pulumi CrossGuard, Vitest 4
tla_required: false
kani_required: false
security_libs_required: false
ai_component: false
compliance: [nist-800-53, nist-ssdf, cis-aws-v5]
---

# IAM policy structural coverage runbook

## Milestone tracker

| Milestone | Title                                                    | Status    | Contract                                                                                                                                                                        |
| --------- | -------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | Fail-closed OIDC trust and full-admin authority coverage | confirmed | Confirmed on 2026-10-15 under the operator's standing instruction to continue the SLO work autonomously, fix all reported vulnerabilities, and publish only after verification. |

## M1 contract

### Goal

Close three source-validated high-severity Codex Security findings in the
Hulumi policy pack:

- `csf_07cae9470e85612a55003c5b`: `G_OIDC_1` accepts singleton statements,
  missing conditions or claims, unsupported operators, invalid claim values,
  and malformed JSON without a violation;
- `csf_e79452231940a960a35497c8`: `G_OIDC_2` observes only one managed-policy
  attachment resource and misses direct role properties, inline policies,
  exclusive/generic attachments, and customer-managed full-admin equivalents;
- `csf_99635f4b115a971bac68009c`: CIS 1.16 misses singleton policy statements and
  common Pulumi attachment shapes.

The milestone parses the IAM structures once, accepts only a bounded safe
GitHub OIDC `sub` condition shape, and follows the complete in-stack Pulumi IAM
authority graph needed to identify exact full-administrator grants.

### Exact file allow-list

- `docs/RUNBOOK-policy-iam-structural-coverage.md`
- `docs/slo/critique/policy-iam-structural-coverage-m1.md`
- `packages/policies/src/aws/iam-policy.ts`
- `packages/policies/src/aws/cis-v5-pack.rules.ts`
- `packages/policies/src/github/g-oidc-1.ts`
- `packages/policies/src/github/g-oidc-2.ts`
- `packages/policies/tests/cis-v5-pack.test.ts`
- `packages/policies/tests/github/hulumi-hardening-pack.test.ts`
- `packages/policies/tests/github/g-oidc-2.test.ts`
- `docs/components/g-oidc-1.md`
- `docs/components/g-oidc-2.md`
- `docs/threat-model-iam-least-privilege-20260728.md`
- `README.md`
- `packages/policies/README.md`
- `docs/slo/verify/policy-iam-structural-coverage-m1.md`
- `docs/slo/lessons/policy-iam-structural-coverage-m1.md`
- `docs/slo/completion/policy-iam-structural-coverage-m1.md`

### Dependency admission

No dependency or lockfile change is permitted. Existing lockfiles still pass
the repository's pinned, checksum-verified OSV gate before merge. Any dependency
change discovered in the diff invalidates this contract and must stop execution.

### Data and authority boundary

Inputs are Pulumi preview resource objects. The rules have no cloud, registry,
filesystem, secret, or network write authority. They inspect only the current
stack graph and emit violations. An in-stack customer-managed policy is treated
as a full-admin equivalent only when its parsed document has an `Allow`
statement containing exact `Action: "*"` and `Resource: "*"`. The milestone does
not claim whole-account effective-authorization analysis, evaluate external
policy versions, or infer broader wildcard combinations.

### BDD acceptance scenarios

| ID       | Given / when                                                                                                                                 | Then                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| BDD-M1-1 | A GitHub-OIDC IAM trust uses a singleton `Statement`.                                                                                        | `G_OIDC_1` inspects it and `G_OIDC_2` classifies the role exactly as it would the array form.                                            |
| BDD-M1-2 | A GitHub-OIDC statement has no condition, no `sub`, an unsupported operator, an invalid value, or more than one attempted `sub` restriction. | `G_OIDC_1` reports a mandatory violation; one exact supported `StringEquals` family condition with nonempty non-wildcard strings passes. |
| BDD-M1-3 | An AWS IAM role trust-policy string cannot be parsed or its statement shape is invalid.                                                      | `G_OIDC_1` reports that the mandatory trust boundary cannot be validated.                                                                |
| BDD-M1-4 | A GitHub-OIDC role receives `AdministratorAccess` through role properties, direct, exclusive, or generic attachment resources.               | `G_OIDC_2` reports the linked role through dependency edges or exact name/ARN values.                                                    |
| BDD-M1-5 | A GitHub-OIDC role has a full-admin inline policy through `inlinePolicies` or `RolePolicy`.                                                  | `G_OIDC_2` reports the exact role and source.                                                                                            |
| BDD-M1-6 | A customer-managed `Policy` contains an exact full-admin statement and is attached to a GitHub-OIDC role.                                    | `G_OIDC_2` follows the policy dependency or ARN value and reports it; scoped customer-managed policies remain accepted.                  |
| BDD-M1-7 | CIS 1.16 sees singleton full-admin JSON or AdministratorAccess in any supported role/direct/exclusive/generic attachment form.               | It emits one mandatory violation for that resource and remains silent for scoped policy documents and non-admin attachments.             |
| BDD-M1-8 | A crafted look-alike issuer, unrelated role, group/user-only attachment, or namespace-scoped EKS policy is present.                          | The GitHub OIDC role correlation remains anchored and produces no unrelated violation.                                                   |

### Step-by-step

1. Record the three findings and the merged-main baseline.
2. Add BDD tests that reproduce singleton, malformed, missing-condition,
   unsupported-operator, direct/inline/exclusive/generic, and customer-managed
   bypasses; preserve the red result.
3. Add a small internal IAM policy normalizer and exact full-admin predicate.
4. Make `G_OIDC_1` validate every GitHub federated statement and fail closed on
   malformed policy structures.
5. Make `G_OIDC_2` correlate every bounded Pulumi role permission edge and use
   the same full-admin predicate as CIS 1.16.
6. Update component, README, and threat-model documentation with exact coverage
   and limitations.
7. Run focused and full tests, build, typecheck, lint, format, OSV, Semgrep,
   secrets, diff review, Codex Security and exact-head CI.
8. Merge only the signed+DCO exact green head and re-scan merged main.

### Forbidden shortcuts

- No string search over serialized policy JSON in place of structural parsing.
- No acceptance of missing, malformed, duplicated, unsupported, non-string, or
  wildcard GitHub OIDC `sub` restrictions.
- No issuer substring matching or role-name substring matching.
- No assumption that a policy ARN is safe when its in-stack policy document is
  available and grants exact full administrator authority.
- No claim that this bounded preview rule computes AWS effective permissions.
- No dependency, release, cloud mutation, infrastructure resource, or unrelated
  policy change.

### Evidence log

| Evidence            | Expected                                                           | Actual                                                                                                           | Status     |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| Baseline            | Existing focused tests pass at merged main `3026d4a273ab`.         | 3 files / 64 tests passed.                                                                                       | pass       |
| Red tests           | Every reported bypass fails before implementation.                 | 23 expected failures reproduced; 65 existing tests still passed.                                                 | pass       |
| Focused tests       | All eight BDD rows pass through the production policies.           | 3 files / 91 tests passed after implementation.                                                                  | pass       |
| Regression/security | Full workspace, OSV, Semgrep, secrets, Codex Security and CI pass. | Build/typecheck/tests/lint/format pass; OSV and Semgrep clean; secret, exact-head CI and Codex Security pending. | local pass |

### Definition of done

- The three canonical findings are absent from a successful exact-head Codex
  Security scan and no replacement finding covers the same path.
- Every BDD and full repository gate passes from the signed+DCO commit reviewed
  by exact-head CI.
- Documentation states the policy graph forms covered and the remaining
  external/effective-authorization boundary.
