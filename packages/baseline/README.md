# `@hulumi/baseline`

Hardened-by-default Pulumi component resources for AWS and GitHub. Drop-in
replacements for raw cloud primitives that ship with public-access
blocks, SSE-KMS, TLS-only policies, CloudTrail multi-region, GuardDuty,
Security Hub, IAM password policies, KMS rotation, and the rest of the
"hardening checklist you re-derive on every project" wired up correctly
out of the box.

Part of the [Hulumi](https://github.com/kerberosmansour/hulumi) toolkit.
Apache-2.0. SLSA Build L3 attestation on every published tarball.

## Install

```bash
pnpm add @hulumi/baseline @pulumi/aws @pulumi/pulumi
# Optional, for the GitHub-side surface:
pnpm add @pulumi/github
```

`@hulumi/baseline@1.5.0` accepts any caret-compatible Pulumi SDK (`@pulumi/aws` in the `7.x` line, `@pulumi/pulumi` in the `3.x` line, `@pulumi/github` in the `6.x` line). The versions Hulumi is **tested against** are listed in this package's `peerDependencies` — that's the floor, not a ceiling. If you already have these SDKs installed at any compatible version, you don't need to change them. The 72h/24h cooling-off CI gate applies inside Hulumi when **we** bump our tested floor — see the project [SECURITY.md](https://github.com/kerberosmansour/hulumi/blob/main/SECURITY.md).

## Quick-start — `SecureBucket`

```ts
import { SecureBucket } from "@hulumi/baseline/aws";

const logs = new SecureBucket("audit-logs", {
  tier: "startup-hardened",
  bucketName: "my-org-audit-logs",
});
```

Sandbox vs Startup-Hardened tiers control which sub-resources land
(public-access block, SSE-KMS, versioning, TLS-only bucket policy,
CloudTrail integration, etc.). See [docs/tiers.md](https://github.com/kerberosmansour/hulumi/blob/main/docs/tiers.md).

## Quick-start — `AccountFoundation`

```ts
import { AccountFoundation } from "@hulumi/baseline/aws";

const foundation = new AccountFoundation("primary", {
  tier: "startup-hardened",
  homeRegion: "us-east-1",
});
```

Composes CloudTrail, Config, GuardDuty, Security Hub, IAM password policy

- access-analyzer, KMS rotation, and the IaC-role tag enforcement into a
  single ComponentResource. See [docs/components/account-foundation.md](https://github.com/kerberosmansour/hulumi/blob/main/docs/components/account-foundation.md).

## Quick-start — `SecureRepository` (GitHub)

```ts
import { SecureRepository } from "@hulumi/baseline/github";

const repo = new SecureRepository("infra", {
  owner: "my-org",
  name: "infra",
  tier: "startup-hardened",
  // acknowledgePublic: true,  // required to set visibility:"public"
});
```

Hardened defaults: branch protection, required signed commits, required
status checks, linear history, admin enforcement, restricted bypass actors,
secret scanning, push protection, dependabot security updates. See
[docs/components/secure-repository.md](https://github.com/kerberosmansour/hulumi/blob/main/docs/components/secure-repository.md).

## What you get

| Surface     | Components                                                                                                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AWS         | `SecureBucket`, `AccountFoundation` (and its sub-components — `CloudTrail`, `Config`, `GuardDuty`, `SecurityHub`, `IamBaseline`, `KmsRing`), `AwsOrganizationSecurityFoundation`, secure AWS primitives (`SecureIamDeploymentRole`, `SecureWorkloadRole`, `SecureSecret`, `SecureLaunchTemplate`), and `SecurityDetectionFoundation` |
| GitHub      | `SecureRepository`, `OrgFoundation` (with switchable Code Security Configurations backend)                                                                                                                                                                      |
| Tier matrix | `Tier` enum + `assertValidTier` (`"sandbox" \| "startup-hardened"`)                                                                                                                                                                                             |
| Mappings    | IDs-only framework citation tables — `mappings/{ccm,cis-aws,nist-800-53-r5,atlas}` (no verbatim CCM / AICM / CAIQ / CIS / NIST control text — see [docs/mappings/licensing.md](https://github.com/kerberosmansour/hulumi/blob/main/docs/mappings/licensing.md)) |

Pair with [`@hulumi/policies`](https://github.com/kerberosmansour/hulumi/tree/main/packages/policies)
(CrossGuard policy packs that catch what the components can't) and
[`@hulumi/drift`](https://github.com/kerberosmansour/hulumi/tree/main/packages/drift)
(local-first drift classifier).

## Verifying SLSA attestations

Every published tarball ships with GitHub Artifact Attestations provenance
from the reusable `sign-and-publish.yml` release lane. Verify before
installing:

```bash
pnpm pack @hulumi/baseline@1.5.0 --pack-destination .
gh attestation verify ./hulumi-baseline-1.5.0.tgz \
  --repo kerberosmansour/hulumi
```

## Documentation

- [Component reference](https://github.com/kerberosmansour/hulumi/tree/main/docs/components)
- [Cookbooks](https://github.com/kerberosmansour/hulumi/tree/main/docs/cookbooks)
- [Why Hulumi](https://github.com/kerberosmansour/hulumi/blob/main/docs/why-hulumi.md)
- [Architecture](https://github.com/kerberosmansour/hulumi/blob/main/docs/ARCHITECTURE.md)

## License

Apache-2.0 — see [LICENSE](./LICENSE) and the project-level
[NOTICE](https://github.com/kerberosmansour/hulumi/blob/main/NOTICE).
