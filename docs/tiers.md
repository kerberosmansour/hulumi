# Hulumi tiers — Sandbox vs. Startup-Hardened

Every Hulumi baseline component accepts a `tier: "sandbox" | "startup-hardened"` parameter. The tier is the controlled-defaults lookup layer: it decides which hardened sub-resources the component emits, which CrossGuard rules apply, and which framework IDs end up on the resource's `hulumi:controls` tag.

**Tier is behaviourally load-bearing.** The Startup-Hardened tier MUST emit strictly more controls than Sandbox. Critique C2 requires ≥2 concrete deltas per component; Hulumi v0.2 delivers ≥3 for every component we ship. A PR that collapses Startup-Hardened back to Sandbox fails the tier-matrix BDD test and CI blocks the merge.

## Pick a tier

| Scenario                                                                                                | Recommended tier                                                                           |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Local experimentation, a scratch stack, or a PR preview                                                 | `sandbox`                                                                                  |
| Any production-facing workload, any regulated-data bucket, any stack that names a blast-radius boundary | `startup-hardened`                                                                         |
| An existing mixed stack being migrated                                                                  | Start with sandbox, plan a migration to startup-hardened before routing production traffic |

Pre-v1.0.0 we accept that teams keep sandbox as the default in CI. Post-v1.0.0 (M5) the SCP template pairs with H3→mandatory to make `startup-hardened` the effective account-level default for production OUs.

## SecureBucket — tier matrix

All sub-resources are children of the `hulumi:baseline:aws:SecureBucket` component.

| Sub-resource                                             | Sandbox | Startup-Hardened | Notes                                                                                |
| -------------------------------------------------------- | :-----: | :--------------: | ------------------------------------------------------------------------------------ |
| `aws:s3/bucket:Bucket` (main bucket)                     |    ✓    |        ✓         | Tagged `hulumi:component`, `hulumi:tier`, `hulumi:controls`.                         |
| `aws:s3/bucketPublicAccessBlock:*` (T/T/T/T)             |    ✓    |        ✓         | All four levers true.                                                                |
| `aws:s3/bucketServerSideEncryptionConfiguration:*`       |    ✓    |        ✓         | SSE-KMS default. Customer CMK via optional `kmsKeyArn`.                              |
| `aws:s3/bucketOwnershipControls:*` (BucketOwnerEnforced) |    ✓    |        ✓         | ACLs disabled.                                                                       |
| `aws:s3/bucketVersioning:*` (Enabled)                    |    ✓    |        ✓         | Non-negotiable in both tiers.                                                        |
| `aws:s3/bucketPolicy:*` (deny non-TLS)                   |    ✓    |        ✓         | `aws:SecureTransport=false` → `Deny`.                                                |
| **`aws:s3/bucketObjectLockConfiguration:*`**             |         |        ✓         | Governance mode, 30-day default retention (configurable via `objectLock` arg).       |
| **`aws:s3/bucketLogging:*`**                             |         |        ✓         | Requires `logBucketArn`. The component constructor throws if missing — see H4 below. |
| **`aws:cloudtrail/eventDataStore:*`**                    |         |        ✓         | Per-bucket CloudTrail Lake data-events; consolidates to AccountFoundation in M3.     |

Three **Startup-Hardened only** rows (bold): `bucketObjectLockConfiguration`, `bucketLogging`, `cloudtrail/eventDataStore`. This is the load-bearing tier delta that the AST test asserts (`≥ 3 sub-resource kinds Sandbox does not emit`).

### <a id="startup-hardened"></a>Startup-Hardened — required args

```ts
new SecureBucket("production-bucket", {
  tier: "startup-hardened",
  logBucketArn: "arn:aws:s3:::org-audit-logs", // required; component throws otherwise
  objectLock: { mode: "governance", days: 30 }, // default if omitted
  kmsKeyArn: "arn:aws:kms:us-east-1:111122223333:key/…", // optional; default AWS-managed key otherwise
});
```

Dropping `logBucketArn` fails twice: the component constructor throws at preview with `Startup-Hardened requires logBucketArn; see docs/tiers.md`, and H4 (`HulumiHardeningPack`) flags the stack as a policy violation. Defense in depth.

### Sandbox — no-arg shape

```ts
new SecureBucket("scratch", { tier: "sandbox" });
```

All six sandbox sub-resources get hardened defaults. No logging, no object-lock, no CloudTrail data-events: this tier is for temporary or non-production workloads where audit-trail requirements are out of scope.

## AccountFoundation — tier matrix

`@hulumi/baseline.aws.AccountFoundation` (M3) composes CloudTrail +
Config + GuardDuty + Security Hub + IAM baseline + KMS ring. Sandbox
gets each at the basic level; Startup-Hardened adds **4 distinct
sub-resource kinds** beyond Sandbox (the load-bearing tier delta the
AST test asserts).

| Sub-resource                                                                   | Sandbox | Startup-Hardened | Notes                                                                                                                                                      |
| ------------------------------------------------------------------------------ | :-----: | :--------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aws:kms/key:Key` × 4 (logs, data, secrets, config)                            |    ✓    |        ✓         | Rotation enabled (CIS §3.8). Startup-Hardened + `orgAccountIds` adds deny-without-tag policy.                                                              |
| `aws:kms/alias:Alias` × 4                                                      |    ✓    |        ✓         | One per CMK.                                                                                                                                               |
| `aws:iam/accountPasswordPolicy:AccountPasswordPolicy`                          |    ✓    |        ✓         | min length 14, reuse 24, complexity (CIS §1.6/1.8/1.9).                                                                                                    |
| `aws:cloudtrail/trail:Trail`                                                   |    ✓    |        ✓         | Sandbox: single-region, basic management events. Startup-Hardened: **multi-region + log-file validation + S3 data events** on log bucket (CIS §3.1, §3.2). |
| `aws:cfg/recorder:Recorder` + `aws:cfg/deliveryChannel:DeliveryChannel`        |    ✓    |        ✓         | Recorder roleArn = `iacRoleArn`; delivery to log bucket.                                                                                                   |
| `aws:guardduty/detector:Detector`                                              |    ✓    |        ✓         | 15-minute publishing frequency.                                                                                                                            |
| `aws:securityhub/account:Account`                                              |    ✓    |        ✓         | `enableDefaultStandards: false`.                                                                                                                           |
| `aws:securityhub/standardsSubscription:StandardsSubscription` (CIS v5.0)       |    ✓    |        ✓         | Subscribed to AWS Security Hub's CIS AWS Foundations v5.0 standard.                                                                                        |
| **`aws:accessanalyzer/analyzer:Analyzer`**                                     |         |        ✓         | Account-level Access Analyzer (CIS §1.19).                                                                                                                 |
| **`aws:guardduty/detectorFeature:DetectorFeature`** × 5                        |         |        ✓         | S3 data events, EKS audit logs, EBS malware protection, RDS login events, runtime monitoring.                                                              |
| **`aws:cfg/configurationAggregator:ConfigurationAggregator`**                  |         |        ✓         | Aggregates Config from `orgAccountIds`. Skipped without `orgAccountIds`.                                                                                   |
| **`aws:cloudwatch/logGroup:LogGroup`**                                         |         |        ✓         | CloudTrail integration with CloudWatch Logs (CIS §3.4).                                                                                                    |
| `aws:securityhub/standardsSubscription:StandardsSubscription` (NIST 800-53 r5) |         |        ✓         | Same TYPE as CIS subscription (so the AST set-difference doesn't double-count it as a delta), but a 2nd instance.                                          |

Four **Startup-Hardened only** rows (bold) form the load-bearing AST
delta.

### Eventual-consistency contract

`aws.securityhub.Account` and both `StandardsSubscription` resources
declare explicit `dependsOn` on the GuardDuty `Detector` and every
`DetectorFeature`. AWS's `CreateDetector` API call resolves only when
the detector is `ENABLED`, so the dependsOn chain provides the
ordering Security Hub needs without a polling probe. See
[components/account-foundation.md § Eventual-consistency contract](components/account-foundation.md#eventual-consistency-contract)
for the full rationale.

## HulumiHardeningPack — rule matrix

| Rule   | Severity | Enforcement (M2) | Enforcement (M5) | What it blocks                                                       |
| ------ | -------- | ---------------- | ---------------- | -------------------------------------------------------------------- |
| H1     | high     | mandatory        | mandatory        | Raw `aws.s3.Bucket` / `aws.s3.BucketV2` outside of `SecureBucket`.   |
| H2     | critical | mandatory        | mandatory        | `file://` state backend; unencrypted S3 state backend (best-effort). |
| **H3** | medium   | advisory         | **mandatory**    | IAM role missing the `hulumi:iac-role=true` tag.                     |
| H4     | high     | mandatory        | mandatory        | Startup-Hardened SecureBucket without a sibling logging resource.    |

### <a id="state-backend"></a>H2 state-backend detection

H2 inspects `process.env.PULUMI_BACKEND_URL` which Pulumi sets during every operation. Behaviour:

- `file://…` → mandatory violation.
- `s3://<bucket>/<key>`, bucket present in stack, matching SSE sibling → silent.
- `s3://<bucket>/<key>`, bucket present, **no** SSE sibling → mandatory violation.
- `s3://<bucket>/<key>`, bucket not present in the current stack → **advisory** (encryption cannot be verified without access to the state bucket).
- Unset `PULUMI_BACKEND_URL` → silent (nothing to validate; likely an offline unit test).

### <a id="iac-role-tag"></a>H3 iac-role tag — advisory today, mandatory in v1.0

M2 ships H3 as `advisory` to avoid creating drive-by failures for teams that haven't yet applied the SCP template. M5 flips it to `mandatory` alongside:

1. `docs/deployment/scp.json` template (M5).
2. The `@hulumi/drift` classifier's CloudTrail principal-attribution signal (M4, depends on this tag).
3. A `CHANGELOG.md` breaking-change note for the v1.0 release.

Teams can opt into `mandatory` today by bumping the pack metadata's enforcement level locally.

## Why three deltas, not one

Critique C2 forced a minimum of two concrete tier deltas per component. One delta reduces "tier" to marketing: a single-boolean toggle. Three deltas puts tier beyond trivial rewrites and forces any relaxation to confront three distinct security properties (retention, attribution, data-plane auditing) at once.

The SecureBucket deltas — object-lock (retention), logging (attribution), CloudTrail Lake (data-plane auditing) — each map to a separate STRIDE row in the skill's `s3-public-bucket-hardening` threat model. Each is independently defensible; dropping any one of them weakens the tier.
