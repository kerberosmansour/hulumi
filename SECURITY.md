# Security Policy (Hulumi v1.0.0)

This is the v1.0.0 SECURITY.md, replacing the M1 stub. It covers
disclosure channels, the Pulumi cooling-off policy, SLSA attestation
verification, typosquat mitigation, transitive-supply-chain
disclosure, and SCP deployment guidance.

## Reporting a vulnerability

Email `security@hulumi.io` (canonical — do not use other channels for
security reports). Include:

- affected package and version,
- reproduction steps or proof-of-concept,
- suggested severity (CVSS 3.1 if possible).

We aim to acknowledge within 72 hours and, for confirmed issues,
publish a fix within 30 days. Coordinated disclosure timelines are
negotiable for complex issues — please say so in the initial email.

Do **not** open a public GitHub issue for a suspected vulnerability.
Do not post to Discussions. PGP key fingerprint is published in
`.github/SECURITY-CONTACTS` (post-v1.0.0 follow-up).

## Canonical install paths (typosquat mitigation — S1)

Hulumi lives at a single canonical repository. Any fork, mirror, or
similarly named project is unofficial.

- **GitHub**: `kerberosmansour/hulumi` (the only authoritative
  GitHub path).
- **Claude Code skill pack**: install via
  `git clone https://github.com/kerberosmansour/hulumi.git
~/.claude/skills/hulumi-threat-model` (subdirectory clone) OR via
  `gh skill install kerberosmansour/hulumi --path skills/hulumi-threat-model`
  once that CLI lands.
- **npm packages**: `@hulumi/baseline`, `@hulumi/policies`,
  `@hulumi/drift` — all from the `@hulumi/` scope, published with
  SLSA Build L3 provenance starting v1.0.0.

If you see a package or skill claiming to be Hulumi at a different
path, **do not install it**. Report the typosquat to
`security@hulumi.io` and to the respective registry.

The v1.0.0 README's "Canonical install" section lists each package's
exact install command + the verification snippet below.

## Verifying SLSA attestations

Every Hulumi tarball published from v1.0.0 onward carries a
`actions/attest-build-provenance` v2 attestation. To verify:

```sh
# Download the tarball
pnpm pack @hulumi/baseline@1.0.0 --pack-destination .

# Verify the attestation chain
gh attestation verify ./hulumi-baseline-1.0.0.tgz \
  --repo kerberosmansour/hulumi
```

Expected output: `✓ Verified attestation` plus the build's commit
SHA + workflow run URL. Repeat for `@hulumi/policies@1.0.0` and
`@hulumi/drift@1.0.0`. The `.github/attestations/README.md` covers
both `gh attestation verify` and `cosign` verification paths.

A failing verification is **not** a transient issue — treat it as
a potential supply-chain attack and report to `security@hulumi.io`.

## Pulumi cooling-off policy (E2, S6)

Hulumi's own releases carry SLSA Build L3 provenance. `@pulumi/*`
transitive dependencies do not carry SLSA attestations as of
2026-04-25. Our compensating controls:

1. **Exact-version-pinning with integrity hashes**: every
   `@pulumi/*` dep is exact-pinned in `pnpm-lock.yaml`. Drift is
   detected by `scripts/exact-pin-guard.mjs` on every PR.
2. **72h cooling-off for minor/major bumps + 24h for patches**:
   `.github/workflows/pulumi-cooling-off.yml` runs on every PR
   bumping a `@pulumi/*` pin. The job calls
   `https://registry.npmjs.org/@pulumi/<pkg>` to look up the
   upstream publish timestamp; if the bump is younger than the
   threshold, the job fails and the PR cannot merge.
3. **Self-applies to first post-release Pulumi bump**: there is no
   bypass for "the first one." Maintainers wait the cooling-off
   window like everyone else.

The cooling-off does not apply to non-`@pulumi/*` deps; those flow
through Dependabot's standard major-version-ignore-list (see
`.github/dependabot.yml`).

## Transitive-supply-chain disclosure

| Dep                          | Provenance today | Compensating control                       |
| ---------------------------- | ---------------- | ------------------------------------------ |
| `@pulumi/pulumi`             | npm — no SLSA    | exact-pin + cooling-off + integrity hashes |
| `@pulumi/aws`                | npm — no SLSA    | exact-pin + cooling-off + integrity hashes |
| `@pulumi/policy`             | npm — no SLSA    | exact-pin (no upstream changes likely)     |
| `@aws-sdk/*`                 | npm — no SLSA    | exact-pin in lockfile; standard Dependabot |
| `simple-git`                 | npm — no SLSA    | exact-pin in lockfile                      |
| `p-timeout`                  | npm — no SLSA    | exact-pin in lockfile                      |
| GitHub Actions reusable wf's | varies           | pinned to exact SHA in workflow files      |

We track a maintainer follow-up to file an upstream
`actions/attest-build-provenance` PR with `pulumi/pulumi-aws`
post-v1.0.0; until that lands, the cooling-off + exact-pin combo
is our defense-in-depth.

## SCP deployment guidance (S4)

`docs/deployment/scp.json` ships as a ready-to-apply AWS
Organizations Service Control Policy that protects the
`hulumi:iac-role=true` tag from non-IaC principals. With the SCP
applied, only the IaC role list named in the SCP can add or remove
the tag — making the tag tamper-evident at AWS level and pairing
with `HulumiHardeningPack` H3 (mandatory in v1.0.0).

Without the SCP applied, H3 still fires at preview time, but a
non-IaC principal could add the tag to itself to bypass. Apply the
SCP for production confidence. See `docs/deployment/scp-guide.md`
for customization, validation, application, and revert procedures.

## Privacy

Hulumi does not transmit telemetry. The `/hulumi-threat-model` skill
writes only to the user's local filesystem. The drift classifier
(`@hulumi/drift`) reads AWS APIs directly from the user's
credentials and writes only to `.hulumi/drift-cache/` on disk with
`chmod 0600`. Foreign-UID cache files are refused on read.

## Supported versions

| Version | Status                                         |
| ------- | ---------------------------------------------- |
| v1.0.x  | **Supported** — security fixes + critical bugs |
| < v1.0  | EOL (pre-release; not supported)               |

Older v1.x patch lines receive backports for **6 months** from the
v1.x.0 release. Major version bumps follow semver; v2.0.0 will
include a migration guide and a deprecation window for v1.x.
