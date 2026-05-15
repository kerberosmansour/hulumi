# AccountFoundation CloudTrail Log Group Output - SLO Ticket Contract v1

> **Purpose**: Execute one issue-sized change with v4 SLO rigor, without requiring a full multi-milestone runbook.
> **Audience**: AI coding agents first, humans second.
> **Source template**: Derived from `docs/slo/templates/runbook-template_v_4_template.md`. Use the full v4 runbook when this contract cannot stay issue-sized.

---

## 1. Ticket Metadata

| Field                                       | Value                                                                                                      |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Ticket Contract ID                          | `ticket-47-accountfoundation-cloudtrail-loggroup`                                                          |
| Source tracker                              | `GitHub Issues`                                                                                            |
| Source issue                                | [#47](https://github.com/kerberosmansour/hulumi/issues/47)                                                 |
| Issue title                                 | `feat(baseline): AuditTrail - CloudTrail multi-region trail with CW Logs integration`                      |
| Labels                                      | `enhancement`, `baseline`, `aws`                                                                           |
| Assignee / owner                            | `kerberosmansour`                                                                                          |
| Target branch                               | `ticket/47-accountfoundation-cloudtrail-loggroup`                                                          |
| Primary stack                               | TypeScript, Pulumi, Vitest                                                                                 |
| Default formatter command                   | `pnpm run format:check`                                                                                    |
| Default typecheck / build command           | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build`                         |
| Default static analysis / lint command      | `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard`   |
| Default unit / BDD command                  | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts`                                  |
| Default runtime validation command          | `N/A - additive Output wiring is covered by Pulumi mock-runtime BDD; real-AWS AccountFoundation is gated` |
| Default dependency / security audit command | `pnpm run lint:exact-pin-guard`                                                                            |
| Default debugger or state-inspection tool   | Pulumi mock-runtime `registrations` in `packages/baseline/tests/setup.ts`                                  |
| Public interfaces stable by default         | `yes - one additive optional output`                                                                       |
| Allowed new dependencies by default         | `none`                                                                                                     |
| Schema/config migration allowed by default  | `no`                                                                                                       |

### Public interfaces that must remain stable unless explicitly listed otherwise

- `AccountFoundation` constructor args remain unchanged.
- Existing `AccountFoundationOutputs` fields remain unchanged.
- New additive output: `cloudTrailLogGroupName: pulumi.Output<string | undefined>`.
- `IdentityAlarms.trailLogGroupName` remains the downstream consumer contract.

---

## 2. Sizing Gate

| Check                                          | Answer                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| User-visible outcome fits in one sentence      | yes - AccountFoundation exposes its CloudTrail CW Logs group name      |
| Expected changed files <= 8                    | yes                                                                    |
| New public surfaces <= 1                       | yes - one additive optional output                                     |
| No schema migration unless explicitly approved | yes                                                                    |
| No cross-subsystem rewrite                     | yes                                                                    |
| Can be reviewed as one PR                      | yes                                                                    |
| Requires full v4 runbook instead               | no - this is a narrow output-wiring ticket                             |

---

## 3. Issue Context

### Problem

Issue #47 originally requested a CloudTrail-to-CloudWatch Logs baseline component. The later scope-down comment reframed the remaining work:

~~~text
AccountFoundation's startup-hardened tier ALREADY emits a multi-region CloudTrail trail with CW Logs integration ... The remaining work is just exposing cloudTrailLogGroupName as an output of AccountFoundation so consumers ... can consume it without re-discovering the name.
~~~

`AuditTrail` now exists, but `AccountFoundation` still exposes only `cloudTrailArn`, so consumers wiring `IdentityAlarms` against AccountFoundation must rediscover the log group.

### Acceptance Criteria From Issue

- [ ] `AccountFoundationOutputs` exposes `cloudTrailLogGroupName` for downstream metric-filter wiring.
- [ ] Startup-Hardened AccountFoundation returns the helper-created CloudWatch Logs group name.
- [ ] Sandbox AccountFoundation remains compatible when no helper log group exists.
- [ ] Component docs explain the `IdentityAlarms.trailLogGroupName` wiring.

### Non-Goals

- No new `AuditTrail` behavior; that component already shipped.
- No changes to CloudTrail resource creation or retention.
- No real-AWS integration expansion.
- No new alarms, metric filters, or SNS routing.

### Reproduction / Current Signal

| Signal           | Evidence                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------ |
| Current source   | `AccountFoundationOutputs` lacks `cloudTrailLogGroupName`                                  |
| Current behavior | `AccountFoundation` registers a startup-hardened CloudWatch Logs group but does not output it |
| Expected result  | Consumers can read `foundation.cloudTrailLogGroupName` and pass it to `IdentityAlarms`      |

---

## 4. Compact Architecture Delta

| Component                         | Existing behavior                              | Change                                      | Interface / trust boundary touched |
| --------------------------------- | ---------------------------------------------- | ------------------------------------------- | ---------------------------------- |
| `AccountFoundation`               | Creates CloudTrail helper and exposes trail ARN | Also exposes helper log group name if present | public TypeScript output surface   |
| `AccountFoundationOutputs`        | Output interface omits log group name           | Add optional-output field                    | public TypeScript output surface   |
| `docs/components/account-foundation.md` | Documents outputs without log group name        | Document downstream `IdentityAlarms` wiring  | public docs                        |

### Data Flow Delta

```text
createCloudTrail(...).logGroup?.name
  -> AccountFoundation.cloudTrailLogGroupName
  -> IdentityAlarms.trailLogGroupName
```

---

## 5. Contract Block

| Contract Row                       | Value                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                             | GitHub issue #47, scope-down comment, existing CloudTrail helper, AccountFoundation output interface                                               |
| Outputs                            | Additive output, mock-runtime BDD coverage, component docs, ticket evidence                                                                        |
| Interfaces touched                 | `AccountFoundationOutputs` and `AccountFoundation` public class field                                                                              |
| Files allowed to change            | `docs/slo/tickets/ticket-47-accountfoundation-cloudtrail-loggroup.md`, `packages/baseline/src/aws/account-foundation.ts`, `packages/baseline/src/aws/account-foundation.outputs.ts`, `packages/baseline/tests/account-foundation.test.ts`, `packages/baseline/tests/setup.ts`, `docs/components/account-foundation.md` |
| Files to read before changing      | `packages/baseline/src/aws/account-foundation.ts`, `packages/baseline/src/aws/account-foundation.outputs.ts`, `packages/baseline/src/aws/cloudtrail.ts`, `packages/baseline/src/aws/identity-alarms.args.ts`, `packages/baseline/tests/account-foundation.test.ts`, `packages/baseline/tests/setup.ts`, `docs/components/account-foundation.md` |
| New files allowed                  | this ticket contract only                                                                                                                         |
| New dependencies allowed           | none                                                                                                                                              |
| Migration allowed                  | no                                                                                                                                                |
| Compatibility commitments          | Existing AccountFoundation consumers compile unchanged; no constructor args or existing outputs change                                             |
| Data classification                | Public                                                                                                                                            |
| Proactive controls in play         | C5 Validate Inputs / Outputs - output shape is regression-tested; C9 Security Logging - enables safe CloudTrail metric-filter wiring               |
| Abuse acceptance scenarios         | BDD rows below cover no hard-coded log group names and sandbox undefined behavior                                                                  |
| Resource bounds introduced/changed | N/A - no new resources, queues, retries, lists, or persistence                                                                                     |
| Invariants/assertions required     | Startup-Hardened output must equal the emitted log group name; Sandbox output must resolve to `undefined`                                          |
| Debugger / inspection expectation  | Use Pulumi mock-runtime registrations if output/name mismatch is ambiguous                                                                         |
| Static analysis gates              | formatter, baseline typecheck/build, baseline lint, license-boundary lint, exact-pin guard                                                         |
| Reversibility / rollback path      | Remove additive output and docs; no state migration because no resource changes                                                                    |
| Exemplar code to copy              | `AuditTrail.cloudWatchLogsGroupName` output pattern in `packages/baseline/src/aws/audit-trail.ts`                                                  |
| Anti-exemplar code not to copy     | Do not rediscover log group by name string construction in consumers                                                                               |
| Refactoring discipline             | N/A - no refactor beyond additive field wiring                                                                                                     |
| AI tolerance contract              | N/A - no AI component                                                                                                                             |
| Forbidden shortcuts                | No hard-coded log group name output; no new CloudWatch resources; no constructor arg changes; no broad AccountFoundation refactor                  |

---

## 6. Implementation Plan

1. Run the baseline AccountFoundation test command.
2. Add BDD assertions for startup-hardened log group output and sandbox undefined output.
3. Run the new focused test and confirm it fails because the output is missing.
4. Add `cloudTrailLogGroupName` to `AccountFoundationOutputs`.
5. Wire `AccountFoundation.cloudTrailLogGroupName` from `cloudTrail.logGroup?.name`.
6. Register the new output in `registerOutputs`.
7. Update `docs/components/account-foundation.md`.
8. Run validation commands and fill evidence.

---

## 7. BDD Acceptance Scenarios

| Scenario                                      | Category               | Given                                    | When                     | Then                                                         | Evidence                    |
| --------------------------------------------- | ---------------------- | ---------------------------------------- | ------------------------ | ------------------------------------------------------------ | --------------------------- |
| Startup-Hardened exposes log group name        | happy path             | `tier: "startup-hardened"`               | construct AccountFoundation | `cloudTrailLogGroupName` resolves to the emitted log group name | mock-runtime unit test      |
| Sandbox has no log group output                | empty / degraded state | `tier: "sandbox"`                        | construct AccountFoundation | `cloudTrailLogGroupName` resolves to `undefined`             | mock-runtime unit test      |
| Output is not hard-coded                       | abuse case             | renamed AccountFoundation component      | construct AccountFoundation | output follows registered log group resource name             | mock-runtime unit test      |
| Existing outputs remain source-compatible      | regression             | existing consumer reads old outputs only | typecheck/build           | no existing output field changes                             | typecheck/build             |

---

## 8. Validation Plan

| Check                            | Command / Action                                                                                         | Expected Result                                    | Actual Result | Status  | Notes |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------- | ------- | ----- |
| Repo hygiene                     | `git status --short --branch && git rev-parse --abbrev-ref HEAD && git symbolic-ref --short refs/remotes/origin/HEAD` | branch is ticket branch; no unrelated dirt         | branch moved from `main` to `ticket/47-accountfoundation-cloudtrail-loggroup`; no dirty files before edits | pass    |       |
| Baseline before change           | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts`                                | green or known failure captured                    | 15 tests passed before edits      | pass    |       |
| New tests fail first             | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts -t "cloudTrailLogGroupName"`    | fails for missing output before implementation     | failed for missing output (`undefined.apply`) before implementation | pass    |       |
| Formatter                        | `pnpm run format:check`                                                                                  | passes                                             | passed after targeted Prettier run | pass    |       |
| Typecheck / build                | `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build`                       | passes                                             | passed                           | pass    |       |
| Static analysis / lint           | `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` | passes                                             | passed                           | pass    |       |
| Unit / BDD tests                 | `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts`                                | passes                                             | 17 tests passed                  | pass    |       |
| Runtime validation               | N/A                                                                                                      | no runtime resource delta                          | N/A           | pass    |       |
| Dependency / security audit      | `pnpm run lint:exact-pin-guard`                                                                          | passes                                             | passed                           | pass    | no deps changed |
| Resource bound / invariant check | `cloudTrailLogGroupName` BDD rows                                                                        | startup-hardened name / sandbox undefined enforced | passed                           | pass    |       |
| Compatibility check              | `pnpm --filter @hulumi/baseline typecheck`                                                               | passes                                             | passed                           | pass    |       |
| `.gitignore` / artifact cleanup  | `git status --short`                                                                                     | no stray generated artifacts                       | only scoped source/docs changes; ticket file is ignored by repo policy and must be force-added if committed | pass    |       |

---

## 9. Workpad / Tracker Updates

Workpad comment: https://github.com/kerberosmansour/hulumi/issues/47#issuecomment-4464315476

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

- Added `AccountFoundation.cloudTrailLogGroupName` as an additive optional output.
- Registered the new output from the existing CloudTrail helper log group.
- Extended Pulumi mock runtime support for CloudWatch LogGroup `name` output.
- Documented Startup-Hardened `IdentityAlarms.trailLogGroupName` wiring.

### Tests And Validation

- `pnpm --filter @hulumi/baseline test -- tests/account-foundation.test.ts` - passed, 17 tests.
- `pnpm --filter @hulumi/baseline typecheck && pnpm --filter @hulumi/baseline build` - passed.
- `pnpm --filter @hulumi/baseline lint && pnpm run lint:license-boundary && pnpm run lint:exact-pin-guard` - passed.
- `pnpm run format:check` - passed after targeted Prettier run.

### Lessons / Follow-Ups

- The mock runtime did not previously populate CloudWatch LogGroup `name`; the harness now echoes the logical name like other provider-derived fields it needs for output tests.

### PR / Issue Links

- PR: pending
- Issue: https://github.com/kerberosmansour/hulumi/issues/47
