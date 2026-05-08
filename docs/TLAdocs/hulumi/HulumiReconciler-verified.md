# Hulumi Reconciler TLA+ Verification

## Scope

This model covers guarded reconciler resource-state transitions for the first destructive cleanup path. It abstracts resources into four finite model values:

| Model value | Meaning                                                    |
| ----------- | ---------------------------------------------------------- |
| `r1`        | in-scope resource with enough ownership evidence           |
| `r2`        | out-of-scope resource without enough ownership evidence    |
| `r3`        | in-scope singleton resource with enough ownership evidence |
| `r4`        | in-scope resource that was already absent before retry     |

The checked state names are `Unknown`, `Candidate`, `Blocked`, `Planned`, `Executing`, `Deleted`, `Retained`, and `Failed`.

## Model Bounds

| Bound                     | Value                     |
| ------------------------- | ------------------------- |
| Resources                 | 4                         |
| Modes                     | `Plan`, `Execute`         |
| Singleton delete option   | `FALSE`                   |
| Already-deleted resources | 1                         |
| Fairness properties       | none; this is safety-only |

## Verified Invariants

| Invariant                       | Assertion                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| `TypeOK`                        | all modeled states stay within the declared state and mode sets                       |
| `DryRunCannotMutate`            | plan mode never enters `Executing` and never creates a new `Deleted` state            |
| `ExecuteCannotDeleteBlocked`    | blocked resources remain non-deleted                                                  |
| `ExecuteCannotDeleteOutOfScope` | newly deleted resources must be in scope                                              |
| `ExecuteRequiresEvidence`       | newly deleted resources must meet the ownership evidence threshold                    |
| `RetainedSingletonNotDeleted`   | retained singleton resources cannot be deleted while singleton delete is disabled     |
| `AlreadyDeletedStaysDeleted`    | retry/idempotence keeps already-deleted resources at `Deleted` without widening scope |

## Verification Command

Run from the repository root:

```sh
cd docs/TLAdocs/hulumi
java -jar "$HOME/.sldo/tla/tla2tools.jar" HulumiReconciler.tla -config HulumiReconciler.cfg
```

Last checked on 2026-05-08 with TLC2 `2026.04.22.172729`:

- 318 states generated.
- 72 distinct states found.
- Complete state graph depth 8.
- No invariant violations found.

## Implementation Link

`packages/drift/src/reconciler.ts` exports `RECONCILER_RESOURCE_STATES`, and `packages/drift/tests/tla-alignment.test.ts` fails if those names diverge from the TLA+ `States` set.

Broad execute-mode changes must link to this model and either keep these invariants true or update the model and verified summary in the same change.
