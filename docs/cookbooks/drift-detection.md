---
title: Wire drift detection into CI
description: Run @hulumi/drift on a schedule, get a verdict that distinguishes console break-glass from provider-API churn from genuine IaC drift.
---

# Wire drift detection into CI

## When to use this recipe

You want to know — daily, hourly, or every push — whether the live state of your AWS account still matches what your Pulumi stack thinks. You also want to know _who_ drifted: a teammate clicking around in the console, a `@pulumi/aws` provider release renaming a field, or a real out-of-band change.

Generic drift detection conflates all three. `@hulumi/drift` distinguishes them via four pluggable adapters (`AutomationApi`, `CloudTrail`, `ProviderVersion`, `GitLog`) and a verdict matrix that mirrors the upstream TLA+ spec exactly.

## Preconditions

- An `AccountFoundation`-bootstrapped AWS account (the classifier's `CloudTrailAdapter` relies on the `hulumi:iac-role=true` principal-attribution signal that `AccountFoundation` enforces). See [account-bootstrap.md](./account-bootstrap.md).
- Pulumi Automation API access — typically a Pulumi Cloud `PULUMI_ACCESS_TOKEN` stored as a CI secret.
- A read-only AWS principal that can call `cloudtrail:LookupEvents` for the resources you care about. Typically the same OIDC role used by your weekly integration job.
- `@hulumi/drift@1.0.0` installed: `pnpm add @hulumi/drift`.

## Steps

### 1. Compose the adapters

Each adapter is constructor-injected — pass real implementations in CI, stubs in tests.

```ts
import {
  DriftClassifier,
  AutomationApiAdapter,
  CloudTrailAdapter,
  ProviderVersionAdapter,
  GitLogAdapter,
} from "@hulumi/drift";
import { simpleGit } from "simple-git";
import { CloudTrailClient, LookupEventsCommand } from "@aws-sdk/client-cloudtrail";
import { LocalWorkspace } from "@pulumi/pulumi/automation";

const cloudTrail = new CloudTrailClient({ region: "us-east-1" });

const classifier = new DriftClassifier({
  adapters: {
    automationApi: new AutomationApiAdapter({
      preview: async () => {
        const stack = await LocalWorkspace.selectStack({
          stackName: "prod",
          workDir: "./",
        });
        const previewResult = await stack.preview();
        return {
          changeSummary: previewResult.changeSummary,
          detailedDiff: previewResult.detailedDiff,
        };
      },
    }),
    cloudTrail: new CloudTrailAdapter({
      lookup: async ({ resourceArn, after, before }) => {
        const out = await cloudTrail.send(
          new LookupEventsCommand({
            LookupAttributes: [{ AttributeKey: "ResourceName", AttributeValue: resourceArn }],
            StartTime: after,
            EndTime: before,
          }),
        );
        return out.Events ?? [];
      },
    }),
    providerVersion: new ProviderVersionAdapter({
      fetcher: {
        pinned: async () => "7.27.0",
        latest: async () => {
          const r = await fetch("https://registry.npmjs.org/@pulumi/aws/latest");
          return ((await r.json()) as { version: string }).version;
        },
      },
    }),
    gitLog: new GitLogAdapter({
      git: simpleGit(),
      paths: ["pulumi/**/*.ts"],
    }),
  },
  probe: async () => ({ delivered: false, inTransit: false }), // wire your CloudTrail sentinel here
});
```

### 2. Classify

```ts
const verdict = await classifier.classify(
  "urn:pulumi:prod::your-stack::stack",
  "urn:pulumi:prod::your-stack::aws:s3/bucketV2:BucketV2::prod-uploads",
  {
    cacheTtlSeconds: 21_600, // 6h default
    awsRegion: process.env.AWS_REGION ?? "us-east-1",
    cacheDir: ".hulumi/drift-cache",
  },
);

console.log(verdict.source, verdict.confidence);
// e.g. "ConsoleBreakGlass" "high"
//      "ProviderApiChurn"  "medium"   ← TLA+-proven ceiling, never high
//      "Unknown"           "low"
```

### 3. Wire into a CI job

```yaml
# .github/workflows/drift.yml
name: drift
on:
  schedule:
    - cron: "0 4 * * *" # daily at 04:00 UTC
  workflow_dispatch: {}

permissions:
  id-token: write # OIDC for AWS
  contents: read

jobs:
  classify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 } # CRITICAL — see troubleshooting
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_DRIFT_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}
      - run: pnpm install --frozen-lockfile
      - run: node scripts/run-drift.mjs
        env:
          PULUMI_ACCESS_TOKEN: ${{ secrets.PULUMI_ACCESS_TOKEN }}
```

### 4. Alert on `ConsoleBreakGlass @ high` only

The verdict matrix promises that `ProviderApiChurn` never escalates above `medium`. If your alerting rule is `confidence == "high"` you get only the verdicts that imply an actual human (or out-of-band automation) touched the resource. This is the design intent — wire it that way.

## Verify

- **First run** writes one cache file per (stack, resource) pair under `.hulumi/drift-cache/<sha256>.json`, chmod `0o600`.
- **Second run within 6h** with no underlying change reports the same verdict from cache and does not re-invoke the adapters (S7 — `tests/rate-limit.test.ts`).
- **Force a console event** on a tagged resource and re-run; verdict should be `ConsoleBreakGlass / high`.
- **Bump the `@pulumi/aws` pin to a previous patch** and re-run; verdict should be `ProviderApiChurn / medium`. Never `high` — the classifier caps it. ([TLA+ rationale](../components/drift-classifier.md#verdict-matrix))

## Troubleshooting

**`GitLogAdapter.available()` returns `false` and the verdict degrades.** You're in a shallow clone (`actions/checkout` defaults to `fetch-depth: 1`). Add `fetch-depth: 0`. The classifier degrades safely on shallow clone (E5 — `tests/shallow-clone.test.ts`); it does not silently lie.

**Probe times out, verdict is `Unknown / low`.** The probe writes a sentinel CloudTrail event tagged `hulumi:probe-sentinel=true` and polls `LookupEvents` until it surfaces or `probeTimeoutMs` fires. The classifier now derives a default from `classify({ awsRegion })`, `new DriftClassifier({ awsRegion })`, `AWS_REGION`, then `AWS_DEFAULT_REGION`; unknown regions fall back to 60s. If your region routinely runs slower than the documented table in [drift-classifier.md](../components/drift-classifier.md#inputs), set `probeTimeoutMs` explicitly. The probe is wrapped in `p-timeout` + `AbortSignal` with no inline `setTimeout` outside `src/probe.ts` — `tests/probe-timeout.test.ts` enforces this (E1).

**Bare `iac-role=true` tag in CloudTrail principal — verdict ignores it.** The classifier requires the full `hulumi:iac-role=true` namespace prefix to attribute an event to your IaC pipeline. Bare `iac-role` is rejected (E4 — `tests/namespace-rejection.test.ts`). Tag your IaC role with the namespaced form.

**Cache file isn't honoured on a new run.** The classifier checks the file's owner UID against the current process UID; foreign-UID files are treated as absent (S2 — `tests/cache-permissions.test.ts`). This protects against cache-poisoning attacks but bites in mixed-user setups; either run the classifier as a single user, or wipe the cache when changing users.

## See also

- [components/drift-classifier.md](../components/drift-classifier.md) — full reference and security guarantees.
- [drift-classifier-deployment.md](../drift-classifier-deployment.md) — operator-side deployment and SCP context.
- [examples/drift-classify-smoke/](../../examples/drift-classify-smoke/) — minimal stubbed example.
- [Verdict matrix BDD](../../packages/drift/tests/verdict-matrix.feature.test.ts) — the test that walks the TLA+ matrix verbatim.
