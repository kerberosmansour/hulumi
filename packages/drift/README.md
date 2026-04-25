# `@hulumi/drift`

Local-first drift classifier for Pulumi stacks. Distinguishes
provider-API churn from console break-glass from genuine IaC drift via
four pluggable adapters whose composition mirrors `HardenedVerdict` in
[`HulumiDrift.tla`](../../docs/TLAdocs/hulumi/HulumiDrift.tla)
(upstream planning corpus) exactly.

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

const verdict = await classifier.classify(
  "urn:pulumi:dev::project::stack",
  "urn:pulumi:dev::project::aws:s3/bucketV2:BucketV2::my-bucket",
);
console.log(verdict.source, verdict.confidence);
```

## Verdict matrix

| #   | Snapshot                                | Source            | Confidence |
| --- | --------------------------------------- | ----------------- | ---------- |
| 1   | `!mutated`                              | None              | none       |
| 2   | `mutated && eventDelivered`             | ConsoleBreakGlass | high       |
| 3   | `mutated && eventInTransit`             | Unknown           | low        |
| 4   | `mutated && providerDrift && !event*`   | ProviderApiChurn  | medium     |
| 5   | `mutated && !provider drift && !event*` | Unknown           | low        |

Row 4's `medium` ceiling is TLA+-proven (`SafetyRealistic` invariant).

## Security guarantees

- **S2** — cache files written with `0o600`; ownership-mismatched files
  are treated as absent. See `tests/cache-permissions.test.ts`.
- **S3** — URNs validated via `urn-sanitize.ts` before reaching git;
  `simple-git` argv-based call form. No `child_process.exec`. See
  `tests/shell-injection.test.ts`.
- **S7** — cache TTL is the rate-limit; within TTL repeat calls return
  cached verdict. See `tests/rate-limit.test.ts`.
- **E1** — probe wraps `p-timeout` + `AbortSignal`; on timeout returns
  `Unknown / low` with `probeFailedAt`. See `tests/probe-timeout.test.ts`.
- **E4** — CloudTrail principal filter requires the FULL
  `hulumi:iac-role=true` tag; bare `iac-role=true` is rejected. See
  `tests/namespace-rejection.test.ts`.
- **E5** — `GitLogAdapter.available()` is `false` on shallow clones;
  classifier degrades to `Unknown / low` with remediation. See
  `tests/shallow-clone.test.ts`.

## Documentation

- [docs/components/drift-classifier.md](../../docs/components/drift-classifier.md)
- [docs/drift-classifier-deployment.md](../../docs/drift-classifier-deployment.md)
- [docs/integration-testing.md](../../docs/integration-testing.md)
