# Security Policy (Hulumi v0.1 stub)

> **Status**: This is the M1 stub. The full SECURITY.md lands in M5 alongside the v1.0.0 release, covering SLSA Build L3 attestation verification, the 72h / 24h Pulumi cooling-off policy, full typosquat mitigation, and the SCP deployment template. The fields below are binding today.

## Reporting a vulnerability

Email `security@hulumi.io` (canonical — do not use other channels for security reports). Please include:

- affected package and version,
- reproduction steps or proof-of-concept,
- suggested severity (CVSS 3.1 if possible).

We aim to acknowledge within 72 hours and, for confirmed issues, publish a fix within 30 days. Coordinated disclosure timelines are negotiable for complex issues — please say so in the initial email.

Do **not** open a public GitHub issue for a suspected vulnerability. Do not post to Discussions.

## Canonical install paths (typosquat mitigation)

Hulumi lives at a single canonical repository. Any fork, mirror, or similarly named project is unofficial.

- GitHub: **`kerberosmansour/hulumi`** (the only authoritative GitHub path).
- Claude Code skill pack: installed via `git clone https://github.com/kerberosmansour/hulumi ~/.claude/skills/hulumi-threat-model` OR `gh skill install kerberosmansour/hulumi --path skills/hulumi-threat-model` once that CLI is stable (shipped 2026-04-16; see the release's README).
- npm packages: `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift` from the `@hulumi/` scope, published with SLSA Build L3 provenance starting M5.

If you see a package or skill claiming to be Hulumi at a different path, **do not install it**. Report the typosquat to `security@hulumi.io` and the respective registry.

## Transitive supply-chain disclosure

Hulumi's own npm releases carry SLSA Build L3 provenance (landing in M5). `@pulumi/*` transitive dependencies do **not** carry SLSA attestations as of 2026-04-24. Our compensating controls:

- `@pulumi/*` packages are exact-version-pinned with integrity hashes in `pnpm-lock.yaml` for every Hulumi release.
- A 72h cooling-off applies to `@pulumi/*` minor + major version bumps; 24h cooling-off applies to patch bumps (CI-enforced from M5 onward).
- An upstream issue requesting `actions/attest-build-provenance` adoption on `pulumi/pulumi-aws` is filed post-M5 as a maintainer follow-up.

## Privacy

Hulumi does not transmit telemetry. The `/hulumi-threat-model` skill writes only to the user's local filesystem. The drift classifier (M4) reads AWS APIs directly from the user's credentials and writes only to `.hulumi/drift-cache/` on disk with `chmod 0600`.

## Supported versions

Until v1.0.0 ships (M5), all Hulumi code is considered **pre-release**. No version is officially supported; the v0.x line exists for dogfood and testing only. The v1.0.0 line will be supported for critical fixes per the full SECURITY.md policy.
