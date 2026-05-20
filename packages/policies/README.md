# `@hulumi/policies`

Pulumi CrossGuard policy packs that catch the things the
[`@hulumi/baseline`](https://github.com/kerberosmansour/hulumi/tree/main/packages/baseline)
components can't — e.g. a PR that bypasses `SecureBucket` and reaches for
a raw `aws.s3.Bucket` / `aws.s3.BucketV2`, or a state backend pointed at `file://`.

Part of the [Hulumi](https://github.com/kerberosmansour/hulumi) toolkit.
Apache-2.0. SLSA Build L3 attestation on every published tarball.

## Install

```bash
pnpm add -D @hulumi/policies @pulumi/policy
```

## Quick-start — load a policy pack locally

```bash
pulumi up --policy-pack node_modules/@hulumi/policies/aws/packs/hulumi-hardening
```

Or programmatically inside a stack:

```ts
import { hulumiHardeningPack } from "@hulumi/policies/aws/packs/hulumi-hardening";

// hulumiHardeningPack is a Pulumi PolicyPack ready to register.
```

## Available packs

### AWS

| Pack                         | Coverage                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `aws/packs/hulumi-hardening` | `HulumiHardeningPack` — invariants H1–H4 (mandatory `hulumi:iac-role=true`, no `file://` state, no public-access drift)                                                      |
| `aws/packs/cis-v5`           | `CisV5Pack` — CIS AWS Foundations Benchmark v5.0.0 sections 1–3 (IDs-only — see [licensing](https://github.com/kerberosmansour/hulumi/blob/main/docs/mappings/licensing.md)) |

### GitHub

| Pack                            | Coverage                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `github/packs/hulumi-hardening` | `HulumiGithubHardeningPack` — H1 (no admin-bypass), H2 (signed commits required), `G_OIDC_1` (OIDC trust) |
| `github/packs/cis-v1`           | `CisGithubV1Pack` — placeholder pending CIS WorkBench access (IDs-only structure ready to fill)           |

### Cloudflare And Platform

| Pack                                   | Coverage                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `cloudflare/packs/hulumi-hardening`    | `CF_DNS_1_NO_DNS_ONLY_PUBLIC_APP_RECORD`, `CF_DNSSEC_1_REQUIRE_PUBLIC_ZONE_DNSSEC`, `CF_ORIGIN_1_REQUIRE_SECURE_ORIGIN_MODE` |
| `platform/packs/origin-bypass`         | `X_ORIGIN_1_NO_PUBLIC_AWS_ORIGIN_BYPASS` advisory for public AWS origins without tunnel or allowlist+AOP evidence            |
| `platform/packs/deployment-governance` | `DEPLOY_GOV_1_REQUIRE_PROTECTED_ENVIRONMENT`, `DEPLOY_GOV_2_NO_LONG_LIVED_AWS_SECRETS`                                       |

The workflow-governance linter lives at `scripts/workflow-governance-lint.mjs`
in the source repo. Its stable rule IDs are documented in
`docs/components/workflow-governance-linter.md`.

## Suppressions

```ts
import { Suppression } from "@hulumi/policies";

const sup: Suppression = {
  pack: "hulumi-hardening",
  rule: "H3",
  scope: { resourceUrn: "urn:pulumi:dev::project::aws:s3/bucket:Bucket::legacy" },
  expires: "2026-12-31",
  reason: "legacy bucket migrating to SecureBucket in Q1; tracked in #ISSUE-42",
};
```

Suppressions are reviewed at policy-evaluation time and surface as
metadata on the verdict; they do not silently mute findings.

## One pack per process

Each pack is a separately exported PolicyPack to preserve the
one-pack-per-process Pulumi invariant. Compose multiple packs by running
multiple policy-pack invocations.

## Verifying SLSA attestations

Every published tarball ships with GitHub Artifact Attestations provenance
from the reusable `sign-and-publish.yml` release lane. Verify before
installing:

```bash
pnpm pack @hulumi/policies@1.4.0 --pack-destination .
gh attestation verify ./hulumi-policies-1.4.0.tgz \
  --repo kerberosmansour/hulumi
```

## License-boundary policy

Hulumi cites framework controls (CSA CCM, CIS AWS Foundations, NIST
800-53 r5, MITRE ATLAS) **by ID only**. Verbatim control text, CAIQ
question text, or Implementation Guideline prose **must not** appear in
this package's source. See
[docs/mappings/licensing.md](https://github.com/kerberosmansour/hulumi/blob/main/docs/mappings/licensing.md).

## Documentation

- [Cookbooks](https://github.com/kerberosmansour/hulumi/tree/main/docs/cookbooks)
- [Component reference](https://github.com/kerberosmansour/hulumi/tree/main/docs/components)
- [Architecture](https://github.com/kerberosmansour/hulumi/blob/main/docs/ARCHITECTURE.md)

## License

Apache-2.0 — see [LICENSE](./LICENSE) and the project-level
[NOTICE](https://github.com/kerberosmansour/hulumi/blob/main/NOTICE).
