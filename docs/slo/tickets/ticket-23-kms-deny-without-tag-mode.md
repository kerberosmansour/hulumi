# KMS Deny-Without-Tag Mode - SLO Ticket Contract v1

> **Purpose**: Execute one issue-sized change with v4 SLO rigor, without requiring a full multi-milestone runbook.
> **Audience**: AI coding agents first, humans second.
> **Source template**: Derived from `docs/slo/templates/runbook-template_v_4_template.md`. Use the full v4 runbook when this contract cannot stay issue-sized.

---

## 1. Ticket Metadata

| Field                                       | Value                                                                                                          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-23-kms-deny-without-tag-mode`                                                                          |
| Source tracker                              | `GitHub Issues`                                                                                                |
| Source issue                                | [#23](https://github.com/kerberosmansour/hulumi/issues/23)                                                     |
| Issue title                                 | `feat(baseline): support KMS deny-without-tag in single-account stacks via two-phase apply`                    |
| Labels                                      | `enhancement`, `baseline`, `aws`                                                                               |
| Assignee / owner                            | `kerberosmansour`                                                                                              |
| Target branch                               | `ticket/23-kms-deny-without-tag-mode`                                                                          |
| Primary stack                               | TypeScript, Pulumi, Vitest                                                                                     |
| Default formatter command                   | `pnpm run format:check`                                                                                        |
| Default typecheck / build command           | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build`                             |
| Default static analysis / lint command      | `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`       |
| Default unit / BDD command                  | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts`                                      |
| Default runtime validation command          | `N/A - KMS policy shape is exercised under Pulumi mock runtime; real-AWS AccountFoundation remains gated`      |
| Default dependency / security audit command | `pnpm run lint:exact-pin-guard`                                                                                |
| Default debugger or state-inspection tool   | Pulumi mock-runtime `registrations` in `packages/baseline/tests/setup.ts`                                      |
| Public interfaces stable by default         | `yes - one additive optional argument; existing default behavior preserved`                                    |
| Allowed new dependencies by default         | `none`                                                                                                         |
| Schema/config migration allowed by default  | `no`                                                                                                           |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `AccountFoundation` constructor remains the same shape.
- Existing `AccountFoundationArgs` fields remain unchanged.
- New additive optional arg: `kmsDenyWithoutTag?: "auto" | "force" | "off"`.
- Default mode is `"auto"` and preserves current behavior.

---

## 2. Sizing Gate

| Check                                          | Answer                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - single-account Startup-Hardened stacks can opt into the KMS deny-without-tag policy |
| Expected changed files <= 8                    | yes                                                                                    |
| New public surfaces <= 1                       | yes - one additive optional AccountFoundation argument                                 |
| No schema migration unless explicitly approved | yes                                                                                    |
| No cross-subsystem rewrite                     | yes                                                                                    |
| Can be reviewed as one PR                      | yes                                                                                    |
| Requires full v4 runbook instead               | no - narrow AccountFoundation/KMS policy-mode change                                  |

---

## 3. Issue Context

### Problem

`AccountFoundation` currently applies the KMS deny-without-tag statement only when `orgAccountIds` is supplied. That preserves single-account bootstrap safety, but it leaves single-account Startup-Hardened stacks without a supported opt-in path once the IaC role is tagged.

Issue excerpt, fenced as tracker input:

~~~text
Today the KMS deny-without-tag policy attaches only when orgAccountIds is supplied — there's a real bootstrap paradox in single-account stacks where the policy itself prevents the principal from updating the policy. A two-phase apply ... would let single-account users opt in. Probably wants a feature flag.
~~~

### Acceptance Criteria From Issue

- [ ] `AccountFoundation` accepts `kmsDenyWithoutTag: "auto" | "force" | "off"` with default `"auto"`.
- [ ] `"force"` applies the deny policy in single-account stacks.
- [ ] Bootstrap recovery is documented if the principal is locked out.
- [ ] Tests exercise the new modes under mocks.

### Non-Goals

- No new Pulumi provider orchestration, dynamic resources, or sleeps.
- No real-AWS integration expansion.
- No changes to KMS key count, aliases, rotation, deletion window, or exported outputs.
- No change to Sandbox tier as a hardening surface; the deny policy remains a Startup-Hardened feature.
- No new deny actions beyond the existing KMS data-plane deny statement.

### Reproduction / Current Signal

| Signal           | Evidence                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| Current source   | `buildKeyPolicy()` adds `DenyKmsActionsWithoutHulumiIacRoleTag` only when `orgAccountIds` is non-empty      |
| Current behavior | Startup-Hardened single-account stacks without `orgAccountIds` cannot opt into the deny statement           |
| Expected result  | `kmsDenyWithoutTag: "force"` scopes the deny statement to the current account when `orgAccountIds` is empty |

---

## 4. Compact Architecture Delta

| Component                 | Existing behavior                                                       | Change                                                        | Interface / trust boundary touched |
| ------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| `AccountFoundationArgs`   | No KMS deny mode; current auto behavior is implicit                     | Add optional `kmsDenyWithoutTag` mode                         | public TypeScript config surface   |
| `AccountFoundation`       | Passes `orgAccountIds` to KMS ring                                      | Validates/defaults mode and passes it to KMS ring             | component configuration boundary   |
| `kms-ring` helper         | Deny statement gated by Startup-Hardened + `orgAccountIds`              | Deny statement gated by mode: auto, force, off                | generated KMS key policy           |
| Component docs            | Warns about single-account bootstrap paradox but gives no opt-in switch | Documents `auto`/`force`/`off`, two-phase opt-in, and recovery | public docs                        |

### Data Flow Delta

```text
AccountFoundationArgs.kmsDenyWithoutTag
  -> AccountFoundation default/validation
  -> createKmsRing(args.kmsDenyWithoutTag)
  -> KMS key policy deny statement present or absent
```

---

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | GitHub issue #23, existing AccountFoundation args/wiring, KMS ring policy helper, AccountFoundation mock tests, component docs                    |
| Outputs                            | Additive optional arg, KMS policy-mode behavior, mock-runtime BDD coverage, docs, ticket evidence                                                 |
| Interfaces touched                 | `AccountFoundationArgs` optional config field and exported type surface                                                                           |
| Files allowed to change            | `docs/slo/tickets/ticket-23-kms-deny-without-tag-mode.md`, `packages/baseline/src/aws/account-foundation.args.ts`, `packages/baseline/src/aws/account-foundation.ts`, `packages/baseline/src/aws/kms-ring.ts`, `packages/baseline/src/aws/index.ts`, `packages/baseline/tests/account-foundation.test.ts`, `docs/components/account-foundation.md` |
| Files to read before changing      | `packages/baseline/src/aws/account-foundation.args.ts`, `packages/baseline/src/aws/account-foundation.ts`, `packages/baseline/src/aws/kms-ring.ts`, `packages/baseline/src/aws/index.ts`, `packages/baseline/tests/account-foundation.test.ts`, `packages/baseline/tests/setup.ts`, `docs/components/account-foundation.md`, `docs/issue-candidates.md` |
| New files allowed                  | this ticket contract only                                                                                                                         |
| New dependencies allowed           | none                                                                                                                                              |
| Migration allowed                  | no                                                                                                                                                |
| Compatibility commitments          | Existing consumers compile unchanged; default `"auto"` preserves current deny behavior; Sandbox tier remains unchanged                            |
| Data classification                | Public                                                                                                                                            |
| Proactive controls in play         | C5 Validate Inputs / Outputs - invalid mode must fail closed; KMS deny mode is explicit and tested                                                |
| Abuse acceptance scenarios         | BDD rows cover invalid mode rejection and `off` suppressing deny even with org account IDs                                                        |
| Resource bounds introduced/changed | N/A - no new resources, retries, queues, lists, caches, or persistence                                                                             |
| Invariants/assertions required     | `auto` + org IDs includes deny; `auto` + no org IDs omits deny; `force` + no org IDs includes deny scoped to current account; `off` omits deny     |
| Debugger / inspection expectation  | Use Pulumi mock-runtime registrations and parsed KMS policy JSON if policy-mode evidence is ambiguous                                             |
| Static analysis gates              | formatter, baseline typecheck/build, baseline lint, license-boundary lint, exact-pin guard                                                        |
| Reversibility / rollback path      | Remove optional arg and restore `orgAccountIds`-only KMS policy gate; no state migration because KMS key policy changes are Pulumi-managed        |
| Exemplar code to copy              | Existing `assertValidTier()` fail-fast pattern; existing AccountFoundation KMS policy grammar tests                                                |
| Anti-exemplar code not to copy     | Do not add sleeps/dynamic providers for two-phase apply; do not hard-code account IDs; do not broaden KMS deny action list                         |
| Refactoring discipline             | N/A - no broad refactor permitted                                                                                                                  |
| AI tolerance contract              | N/A - no AI component                                                                                                                             |
| Forbidden shortcuts                | No default behavior change; no undocumented `force` mode; no silent fallback for invalid mode; no new AWS resources or dependency changes         |

---

## 6. Implementation Plan

1. Run the focused AccountFoundation test command as baseline.
2. Add BDD rows for `auto`, `force`, `off`, and invalid mode before implementation.
3. Run the new focused BDD and confirm it fails for the missing argument/mode behavior.
4. Add the mode type/constant to `account-foundation.args.ts` and export it from `index.ts`.
5. Validate/default the mode in `AccountFoundation`.
6. Pass the mode into `createKmsRing()` and update `buildKeyPolicy()` gate logic.
7. Document the mode table, two-phase opt-in, and recovery path.
8. Run validation commands and fill evidence.

---

## 7. BDD Acceptance Scenarios

| Scenario                                    | Category               | Given                                      | When                         | Then                                                          | Evidence |
| ------------------------------------------- | ---------------------- | ------------------------------------------ | ---------------------------- | ------------------------------------------------------------- | -------- |
| Auto preserves org behavior                  | happy path             | Startup-Hardened with `orgAccountIds`      | construct AccountFoundation  | each KMS key policy includes `DenyKmsActionsWithoutHulumiIacRoleTag` scoped to those accounts | mock-runtime unit test |
| Auto preserves single-account default        | regression             | Startup-Hardened without `orgAccountIds`   | construct AccountFoundation  | KMS key policies omit the deny statement                      | mock-runtime unit test |
| Force enables single-account opt-in          | happy path             | Startup-Hardened without `orgAccountIds`, `kmsDenyWithoutTag: "force"` | construct AccountFoundation | KMS key policies include the deny statement scoped to current account | mock-runtime unit test |
| Off suppresses org-account deny              | abuse case             | Startup-Hardened with `orgAccountIds`, `kmsDenyWithoutTag: "off"` | construct AccountFoundation | KMS key policies omit the deny statement                      | mock-runtime unit test |
| Invalid mode fails closed                    | invalid input          | JS caller passes an unsupported string     | construct AccountFoundation  | constructor throws with allowed mode list                     | unit test |
| Sandbox remains unchanged                    | empty / degraded state | Sandbox with default args                  | construct AccountFoundation  | no deny statement is emitted                                  | existing + focused unit test |

---

## 8. Validation Plan

| Check                            | Command / Action                                                                                         | Expected Result                                    | Actual Result | Status  | Notes |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------- | ------- | ----- |
| Repo hygiene                     | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | branch is ticket branch; no unrelated dirt         | branch `ticket/23-kms-deny-without-tag-mode`; origin default `main`; no dirty files before edits | pass |       |
| Baseline before change           | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts`                                | green or known failure captured                    | passed: 17 tests before edits | pass |       |
| New tests fail first             | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts -t "kmsDenyWithoutTag"`         | fails for missing mode behavior before implementation | failed as expected: `force` had no deny statement, `off` could not suppress deny, invalid mode did not throw | pass |       |
| Formatter                        | `pnpm run format:check`                                                                                  | passes                                             | initially flagged two touched files; targeted Prettier run; rerun passed | pass |       |
| Typecheck / build                | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build`                       | passes                                             | passed | pass |       |
| Static analysis / lint           | `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` | passes                                             | passed; license-boundary OK; exact-pin guard OK | pass |       |
| Unit / BDD tests                 | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts`                                | passes                                             | passed: 22 tests | pass |       |
| Runtime validation               | N/A                                                                                                      | no runtime resource delta                          | N/A - policy shape covered by Pulumi mocks | pass | policy shape covered by mocks |
| Dependency / security audit      | `pnpm run lint:exact-pin-guard`                                                                          | passes                                             | passed: 13 pinned deps match expected integrity hashes | pass | no deps changed |
| Resource bound / invariant check | `kmsDenyWithoutTag` BDD rows                                                                             | mode matrix enforced                               | passed: 5 focused mode tests | pass |       |
| Compatibility check              | `pnpm --filter @hulumi/baseline typecheck`                                                               | passes                                             | passed | pass |       |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                     | no stray artifacts outside scoped files            | scoped changes only; ticket file is ignored by repo policy and must be force-added if committed | pass |       |
| Diff whitespace                  | `git diff --check`                                                                                       | passes                                             | passed | pass |       |

---

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/23#issuecomment-4464581862

---

## 10. Self-Review Gate

- [x] Did I stay inside the file allow-list?
- [x] Did I write or update BDD tests before production code?
- [x] Did I confirm new tests failed for the right reason before implementing?
- [x] Did I preserve public interfaces unless explicitly allowed to change them?
- [x] Did I add or strengthen assertions/invariants where the contract required them?
- [x] Did I bound new resource growth or document why no bound applies?
- [x] Did I run formatter, typecheck/build, and static analysis?
- [x] Did I use a debugger or state-inspection tool when failure evidence was ambiguous?
- [x] Did I remove temporary proof edits, debug output, and placeholder logic?
- [x] Did I record evidence rather than claims?
- [ ] Did I update the issue workpad and PR handoff notes?

---

## 11. Closure Summary

### Completed

- Added `kmsDenyWithoutTag?: "auto" | "force" | "off"` to `AccountFoundationArgs`.
- Preserved default `"auto"` behavior for org-account deny policies.
- Added `"force"` single-account opt-in scoped to the current AWS account.
- Added `"off"` suppression and invalid-mode fail-closed validation.
- Documented two-phase opt-in and break-glass recovery.

### Tests And Validation

- `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts -t "kmsDenyWithoutTag"` failed first for the expected missing behavior, then passed with 5 focused tests.
- `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts` passed with 22 tests.
- `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build` passed.
- `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` passed.
- `pnpm run format:check` passed after targeted Prettier.
- `git diff --check` passed.

### Lessons / Follow-Ups

- The two-phase behavior is an operator workflow enabled by the mode switch; no new Pulumi orchestration mechanism was needed.

### PR / Issue Links

- PR: pending
- Issue: https://github.com/kerberosmansour/hulumi/issues/23
