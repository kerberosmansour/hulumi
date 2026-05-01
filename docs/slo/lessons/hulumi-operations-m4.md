# Lessons Learned — hulumi-operations Milestone 4 (combined M10)

## What changed

Four-rule CrossGuard pack `HulumiOperationsHardeningPack`:
- `O_PATCH_1`: `Patch:Group` tag value enum (dev|staging|production).
- `O_AUDIT_1`: CloudTrail multi-region + log-file validation required.
- `O_AUDIT_2`: CT log groups (`/aws/cloudtrail/*`) KMS-encrypted.
- `O_INSPECTOR_1`: Inspector v2 covers EC2 + ECR + LAMBDA.

## Design decisions and why

- **`O_PATCH_1` keys off the `aws:ssm/maintenanceWindowTarget:MaintenanceWindowTarget` resource type** — that's where the `tag:Patch:Group` filter lives. Could also have keyed off the EC2 instance tag directly, but the MaintenanceWindowTarget is where Hulumi's components write the value, and where consumer raw-resource use will be visible.
- **`O_AUDIT_2` filters by log-group name prefix `/aws/cloudtrail/`** — narrower than "all CW Logs groups must be encrypted" (which is a broader rule that may belong in CIS-AWS-v5.0.0 or `HulumiHardeningPack`). The Operations pack is targeted: only the trail's log group.
- **`O_INSPECTOR_1` requires all three resource types as a Set** — order doesn't matter; partial coverage is the documented blind-spot.
- **Reused the existing AWS `Suppression` shape** — same `matchSuppression` import as M3's K8s packs.

## Invariants

- `Patch:Group` tag value ∈ {dev, staging, production}.
- CloudTrail `isMultiRegionTrail === true` AND `enableLogFileValidation === true`.
- CT log groups have `kmsKeyId` set.
- Inspector v2 `resourceTypes` ⊇ {EC2, ECR, LAMBDA}.

## Carry-forward

- The pack entry-point pattern (`packs/hulumi-operations-hardening.ts`) means consumers add another `--policy-pack` flag at preview time. M11's release-readiness docs should mention this.
- Future ops rules (e.g. detective-services-coverage, KEV-routing-presence) can be appended to the same pack without breaking consumer wiring.
