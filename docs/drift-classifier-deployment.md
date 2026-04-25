# DriftClassifier deployment

The `@hulumi/drift` classifier runs locally — no hosted service —
but the `CloudTrailAdapter` does need to talk to AWS, and the
`AutomationApiAdapter` needs Pulumi credentials. This document
covers the minimal deployment shape and the M5-paired SCP guarantee.

## Auth

- **Pulumi Automation API**: standard Pulumi credentials (Pulumi
  Cloud token, or a self-managed S3+DDB backend with AWS creds).
- **CloudTrail LookupEvents**: AWS credentials with read-only
  `cloudtrail:LookupEvents` scoped to the stack's region. In CI,
  use OIDC + the `hulumi-sandbox-iac-role` (M3 setup).
- **Git**: read-only; no network call.
- **npm registry** (provider-version): no auth needed for public
  packages.

## Probe sentinel

The CloudTrail delivery probe writes a tagged sentinel event before
each classify cycle:

- Event source: `aws.s3` (`PutObjectTagging` on a tiny
  Hulumi-owned object).
- Tag: `hulumi:probe-sentinel=true`.

The classifier polls `LookupEvents` filtered on the sentinel tag
until the event surfaces or `probeTimeoutMs` fires. The sentinel
write is idempotent and near-zero cost.

**One-time setup** (per AWS account):

```ts
import { SecureBucket } from "@hulumi/baseline/aws";

const probeBucket = new SecureBucket("hulumi-probe-sentinel", {
  tier: "startup-hardened",
  logBucketArn: "arn:aws:s3:::your-audit-logs",
});
```

## Cache TTL

Default 6 hours. Within TTL, repeat `classify()` calls return the
cached verdict and adapters are not re-invoked. This is also the
S7 rate-limit guarantee.

Tune via `cacheTtlSeconds` per call:

```ts
classifier.classify(stack, resource, { cacheTtlSeconds: 60 });
```

The cache lives at `.hulumi/drift-cache/` (override via
`cacheDir`). Files are written `0o600`. Foreign-UID files are
refused on read.

## SCP pointer (M5)

Hulumi v1.0 ships
[`docs/deployment/scp.json`](deployment/scp.json) (M5 deliverable).
Apply that SCP at the AWS Organizations OU level to make the
`hulumi:iac-role=true` tag tamper-evident: only the IaC role list
in the SCP can add or remove the tag from any IAM principal. With
the SCP applied, M2's `HulumiHardeningPack` H3 flips from advisory
to mandatory in v1.0 (per CHANGELOG breaking-change note).

Without the SCP, the classifier still works — but the
`CloudTrailAdapter` cannot tell if a non-IaC principal added the
tag to itself. Apply the SCP for production confidence.

## Failure modes

| Symptom                                | Cause                                           | Resolution                                                    |
| -------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| All verdicts `Unknown / low`           | Probe timeout — CloudTrail delivery slow / down | Re-run; CloudTrail recovers within minutes typically.         |
| `GitLogAdapter.available()=false`      | Shallow clone (`--depth=1`)                     | `git fetch --unshallow` in CI / locally.                      |
| `cacheOwnershipMismatch` evidence      | Cache file owned by another UID                 | Rare. Delete `.hulumi/drift-cache/<hash>.json`; re-run.       |
| `ProviderApiChurn @ high` (regression) | TLA+ alignment broken                           | The `verdict-matrix.feature.test.ts` will fail; re-sync TLA+. |
| CloudTrail `AccessDeniedException`     | Missing `cloudtrail:LookupEvents` permission    | Grant it on the principal running the classifier.             |
