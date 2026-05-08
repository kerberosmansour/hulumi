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

## Guarded reconciliation and sweeping

`DriftClassifier` remains classify-only and non-destructive. Cleanup and
state-reconciliation decisions live behind the separate
`OrphanReconciler` / `OrphanSweeper` surface.

The first supported sweep primitive is versioned S3 cleanup for
strongly-owned failed-run buckets:

```ts
import { OrphanReconciler, S3SweeperExecutor } from "@hulumi/drift";

const reconciler = new OrphanReconciler({
  executors: {
    drainS3BucketVersions: new S3SweeperExecutor({
      expectedPrefix: "af-e2e-abc123",
      deleteBucket: true,
    }),
  },
});

const plan = reconciler.plan({
  mode: "sweep-only",
  scope: {
    stackName: "sandbox-abc123",
    resourcePrefix: "af-e2e-abc123",
    regions: ["us-east-1"],
    minAgeMinutes: 15,
    ownershipMinSignals: 2,
  },
  targets: [
    {
      inState: false,
      existsInCloud: true,
      identity: {
        provider: "aws",
        type: "aws:s3/bucketV2:BucketV2",
        physicalId: "af-e2e-abc123-logs",
        region: "us-east-1",
      },
      ownership: [
        { signal: "name-prefix", subject: "af-e2e-abc123-logs", confidence: "high" },
        { signal: "tag", subject: "hulumi:component=AccountFoundation", confidence: "high" },
      ],
    },
  ],
});

await reconciler.execute(plan, {
  confirmToken: plan.confirmToken,
  allow: ["deleteCloudResource"],
});
```

The guarded path is deliberately narrow:

- `check-only` and `plan` modes cannot execute.
- Execute requires the plan confirmation token.
- Cloud-only resources require an explicit prefix and at least two
  ownership signals by default.
- Shared singleton resources are retained unless explicitly enabled.
- Plan artifacts redact account IDs, bucket names, ARNs, backend URLs,
  and evidence subjects before upload.
- The S3 executor uses AWS SDK calls only, drains object versions/delete
  markers in batches of 1000, aborts multipart uploads, and refuses bucket
  names outside the configured prefix.

For read-only discovery, feed known Pulumi state and explicitly scoped
cloud inventory into `discoverReconcileTargets()` before planning:

```ts
import { discoverReconcileTargets, OrphanReconciler } from "@hulumi/drift";

const discovered = discoverReconcileTargets({
  scope: { resourcePrefix: "af-e2e-abc123", regions: ["us-east-1"] },
  pulumiState: await stack.exportStack(),
  cloudResources: [
    {
      provider: "aws",
      type: "aws:s3/bucketV2:BucketV2",
      physicalId: "af-e2e-abc123-logs",
      region: "us-east-1",
      tags: { "hulumi:component": "AccountFoundation" },
    },
  ],
});

const plan = new OrphanReconciler().plan({
  mode: "plan",
  scope: { resourcePrefix: "af-e2e-abc123", regions: ["us-east-1"] },
  targets: discovered.targets,
});
```

## Documentation

- [docs/components/drift-classifier.md](../../docs/components/drift-classifier.md)
- [docs/drift-classifier-deployment.md](../../docs/drift-classifier-deployment.md)
- [docs/integration-testing.md](../../docs/integration-testing.md)
