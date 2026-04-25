# `hulumi.drift.DriftClassifier`

Local-first drift classifier for Pulumi stacks. Composes four
pluggable adapters (`AutomationApiAdapter`, `CloudTrailAdapter`,
`ProviderVersionAdapter`, `GitLogAdapter`) into a single
`classify(stack, resource, options)` call whose verdict logic mirrors
the TLA+ `HardenedVerdict` from
[`HulumiDrift.tla`](../TLAdocs/hulumi/HulumiDrift.tla) (upstream
planning corpus) cell by cell.

**Stability**: `stable` from v0.4 per
[interfaces.md §3](../design/hulumi/interfaces.md).
**Ships**: M4.
**Paired**: M3's `AccountFoundation` (provides the
`hulumi:iac-role=true` principal-attribution signal that the
`CloudTrailAdapter` relies on).

## Quick-start

```ts
import {
  DriftClassifier,
  AutomationApiAdapter,
  CloudTrailAdapter,
  ProviderVersionAdapter,
  GitLogAdapter,
} from "@hulumi/drift";
import { simpleGit } from "simple-git";

const classifier = new DriftClassifier({
  adapters: {
    automationApi: new AutomationApiAdapter({ preview: runPulumiPreview }),
    cloudTrail: new CloudTrailAdapter({ lookup: cloudTrailLookup }),
    providerVersion: new ProviderVersionAdapter({ fetcher: pinnedVsLatest }),
    gitLog: new GitLogAdapter({ git: simpleGit(), paths: ["pulumi/**/*.ts"] }),
  },
  probe: cloudTrailDeliveryProbe,
});

const verdict = await classifier.classify(stackUrn, resourceUrn, {
  cacheTtlSeconds: 21600, // 6h default
  probeTimeoutMs: 60_000, // 60s default
});
```

## Verdict matrix

The five rows are the TLA+ trace, walked verbatim by
[`packages/drift/tests/verdict-matrix.feature.test.ts`](../../packages/drift/tests/verdict-matrix.feature.test.ts):

| #   | Snapshot                                       | Source            | Confidence |
| --- | ---------------------------------------------- | ----------------- | ---------- |
| 1   | `!mutated`                                     | None              | none       |
| 2   | `mutated && eventDelivered`                    | ConsoleBreakGlass | high       |
| 3   | `mutated && eventInTransit && !eventDelivered` | Unknown           | low        |
| 4   | `mutated && providerDrift && !event*`          | ProviderApiChurn  | medium     |
| 5   | `mutated && !providerDrift && !event*`         | Unknown           | low        |

Row 4's `medium` ceiling is **TLA+-proven** (`SafetyRealistic`
invariant — `verdict = ProviderApiChurn @ high` and `mutated` never
coincide). The classifier MUST cap ProviderApiChurn at `medium`; any
drift here would fail the verdict-matrix BDD test.

## Inputs

| Arg               | Default               | Notes                                             |
| ----------------- | --------------------- | ------------------------------------------------- |
| `window.before`   | now − 24h             | CloudTrail / GitLog scan window upper bound.      |
| `window.after`    | now                   | Lower bound.                                      |
| `minConfidence`   | undefined             | Below threshold → cache write skipped.            |
| `requireAdapters` | undefined             | Future: enforce specific adapters present (M4.x). |
| `probeTimeoutMs`  | 60_000                | Probe abort deadline.                             |
| `cacheTtlSeconds` | 21_600 (6h)           | TTL gating cache hits.                            |
| `cacheDir`        | `.hulumi/drift-cache` | On-disk cache directory.                          |

## Outputs

`DriftVerdict { resource, source, confidence, evidence[], recommendation? }`
per affected resource. Persisted to
`<cacheDir>/<sha256(stack||resource)>.json` chmod `0o600`.

## Eventual-consistency contract

CloudTrail's `LookupEvents` is asynchronous — events can be in
transit but not yet delivered. The probe writes a sentinel event
tagged `hulumi:probe-sentinel=true` and polls
`LookupEvents` until the event surfaces or `probeTimeoutMs` fires.
On timeout, the classifier degrades to `Unknown / low` with
`probeFailedAt` populated (E1).

The probe is wrapped in `p-timeout` + `AbortSignal` — there is **no
inline `setTimeout` / `sleep`** in component-composition source.
The `tests/no-shell-exec.test.ts` lint enforces this: every use of
`setTimeout` lives in `src/probe.ts` and only there.

## Security guarantees

| ID  | Guarantee                                                              | Test                                |
| --- | ---------------------------------------------------------------------- | ----------------------------------- |
| S2  | Cache files written with `0o600`; foreign-UID files treated as absent  | `tests/cache-permissions.test.ts`   |
| S3  | URNs validated via `urn-sanitize.ts`; `simple-git` argv-based only     | `tests/shell-injection.test.ts`     |
| S7  | Cache TTL is the rate-limit; within TTL, adapters not re-invoked       | `tests/rate-limit.test.ts`          |
| E1  | Probe `p-timeout` + AbortSignal; on timeout → `Unknown/low`            | `tests/probe-timeout.test.ts`       |
| E4  | CloudTrail filter requires FULL `hulumi:iac-role=true`; bare rejected  | `tests/namespace-rejection.test.ts` |
| E5  | Shallow-clone → `GitLogAdapter.available()=false`; classifier degrades | `tests/shallow-clone.test.ts`       |

## Forbidden in `packages/drift/src/`

- `child_process` import or `exec()` / `spawn()` call (S3).
- `setTimeout` / `sleep` / `await new Promise` outside `src/probe.ts`.
- Extending `DriftSource` enum without re-verifying TLA+.
- `ProviderApiChurn @ high` ever (TLA+ ceiling).
- Bare-tag CloudTrail filter without the `hulumi:` namespace prefix.

The above are enforced by tests in `packages/drift/tests/`.

## Mock-unit testing

The 4 adapters are constructor-injected; tests pass stub
implementations of each adapter's lookup function (no AWS, no git,
no Pulumi engine). Real-AWS integration runs **weekly** via
[`.github/workflows/weekly-integration.yml`](../../.github/workflows/weekly-integration.yml)
after the `AccountFoundation` stage's teardown.

## Planned deltas

- **v1.0 (M5)**: SLSA Build L3 attestation on the published
  `@hulumi/drift` package; H3 advisory→mandatory paired with the SCP
  template.
- **v1.1+**: `/hulumi-drift` Claude Code skill wrapping the
  classifier; standalone `hulumi` CLI.
