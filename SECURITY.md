# Security Policy

Hulumi ships hardened-by-default Pulumi components, CrossGuard policies, and a
local-first drift classifier — security-sensitive infrastructure that
downstream stacks rely on. Please report vulnerabilities privately so
maintainers can assess and fix them before public disclosure.

## Reporting a vulnerability

Use GitHub's private advisory flow:

→ **https://github.com/kerberosmansour/hulumi/security/advisories/new**

If that is unavailable, contact the maintainer through the public GitHub
profile and include enough detail to reproduce the issue. **Do not open a
public issue for vulnerabilities.**

Useful reports include:

- Affected package (`@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`,
  `@hulumi/k8s-baseline`, `@hulumi/cloudflare-baseline`, or
  `@hulumi/platform-patterns`), version, and the `@pulumi/*` peer-dep
  versions in your stack.
- Minimal reproduction or proof of concept — a Pulumi program plus
  `pulumi preview` output is usually enough.
- Expected impact and attacker preconditions (privileged AWS principal?
  console access? CI-role-takeover?).
- Whether secrets, IAM boundaries, framework prose (CCM/CIS/NIST), tag-based
  enforcement (`hulumi:iac-role`), or supply-chain behavior are involved.

## Response targets

| Step                           | Target                                        |
| ------------------------------ | --------------------------------------------- |
| Initial acknowledgement        | 3 business days                               |
| Triage and severity assessment | 7 business days                               |
| Fix plan or status update      | 14 business days                              |
| Coordinated disclosure         | After a fix or agreed mitigation is available |

These are targets, not guarantees. Reports involving active exploitation,
credential exposure, IaC-tag bypass, drift-classifier verdict tampering, or
release-pipeline compromise are handled first.

## Supported versions

| Version | Status                                         |
| ------- | ---------------------------------------------- |
| v1.x    | **Supported** — security fixes + critical bugs |
| < v1.0  | EOL (pre-release; not supported)               |

Older v1.x patch lines receive backports for **6 months** from the v1.x.0
release. Major version bumps follow semver; v2.0.0 will include a migration
guide and a deprecation window for v1.x — see [`docs/v2-migration.md`](./docs/v2-migration.md).

## Scope

In scope:

- Vulnerabilities in any of the six published packages: `@hulumi/baseline`,
  `@hulumi/policies`, `@hulumi/drift`, `@hulumi/k8s-baseline`,
  `@hulumi/cloudflare-baseline`, `@hulumi/platform-patterns`.
- Unsafe defaults in components, examples, cookbooks, or the
  `/hulumi-threat-model` skill that could reasonably be copied into
  production.
- CI, dependency, supply-chain, SLSA-attestation, and release-pipeline
  weaknesses — including the `@pulumi/*` cooling-off gate, the exact-pin
  guard, and the license-boundary lint.
- Drift-classifier verdict tampering or bypass.
- IaC-tag (`hulumi:iac-role=true`) enforcement bypass at component or
  policy-pack level.
- Sensitive data leakage in components, policies, drift cache files, or
  threat-model outputs.

Out of scope:

- Vulnerabilities in downstream Pulumi programs that use Hulumi components
  incorrectly (e.g. constructing `aws.s3.BucketV2` directly instead of
  `SecureBucket`).
- AWS-side, GitHub-side, or Kubernetes-side vulnerabilities not introduced
  or amplified by Hulumi components.
- Denial-of-service against public project infrastructure such as GitHub
  Issues.
- Social engineering, spam, or physical attacks.
- Reports that require compromising third-party services not controlled by
  this project (npm registry, GitHub itself, Pulumi Cloud, AWS, etc.).

## Canonical install paths (typosquat mitigation)

Hulumi lives at a single canonical repository. Any fork, mirror, or similarly
named project is unofficial.

- **GitHub**: `kerberosmansour/hulumi` — the only authoritative GitHub path.
- **npm packages**: `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`,
  `@hulumi/k8s-baseline`, `@hulumi/cloudflare-baseline`,
  `@hulumi/platform-patterns` — all from the `@hulumi/` scope, published
  with SLSA Build L3 provenance starting v1.0.0.
- **Claude Code skill pack**: install via
  `git clone https://github.com/kerberosmansour/hulumi.git ~/.claude/skills/hulumi-threat-model`
  (subdirectory clone).

If you see a package or skill claiming to be Hulumi at a different path,
**do not install it**. Report the typosquat through the GitHub Security
Advisory link above and to the respective registry.

The README's "Canonical install" section lists each package's exact install
command + the verification snippet below.

## Verifying SLSA attestations

Every Hulumi tarball published from v1.0.0 carries an
`actions/attest-build-provenance` v2 attestation. To verify:

```sh
# Download the tarball
pnpm pack @hulumi/baseline@1.3.1 --pack-destination .

# Verify the attestation chain
gh attestation verify ./hulumi-baseline-1.3.1.tgz \
  --repo kerberosmansour/hulumi
```

Expected output: `✓ Verification succeeded` plus the build's commit SHA +
workflow run URL. Repeat for `@hulumi/policies@1.3.1`, `@hulumi/drift@1.3.1`,
`@hulumi/k8s-baseline@1.3.1`, `@hulumi/cloudflare-baseline@1.3.1`, and
`@hulumi/platform-patterns@1.3.1`. The
[`.github/attestations/README.md`](./.github/attestations/README.md) covers
both `gh attestation verify` and `cosign` verification paths.

A failing verification is **not** a transient issue — treat it as a
potential supply-chain attack and report through the GitHub Security
Advisory link above.

## Pulumi cooling-off policy

Hulumi's own releases carry SLSA Build L3 provenance. `@pulumi/*` transitive
dependencies do not carry SLSA attestations as of v1.3.1. Our compensating
controls:

1. **Exact-version-pinning with integrity hashes**: every `@pulumi/*` dep is
   exact-pinned in `pnpm-lock.yaml`. Drift is detected by
   [`scripts/exact-pin-guard.mjs`](./scripts/exact-pin-guard.mjs) on every PR.
   The guard also covers `@hulumi/drift`'s runtime deps
   (`@aws-sdk/client-cloudtrail`, `@aws-sdk/client-sts`,
   `@aws-sdk/credential-providers`, `p-timeout`, `simple-git`) and
   `@hulumi/k8s-baseline`'s `@aws-sdk/client-secrets-manager`, plus
   `@pulumi/github` and `@pulumi/cloudflare` for the GitHub and edge
   surfaces — 13 pinned packages total at v1.3.1.
2. **72h cooling-off for minor/major bumps + 24h for patches**:
   [`.github/workflows/pulumi-cooling-off.yml`](./.github/workflows/pulumi-cooling-off.yml)
   runs on every PR bumping a `@pulumi/*` pin. The job calls
   `https://registry.npmjs.org/@pulumi/<pkg>` to look up the upstream publish
   timestamp; if the bump is younger than the threshold, the job fails and
   the PR cannot merge.
3. **Self-applies to first post-release Pulumi bump**: there is no bypass
   for "the first one." Maintainers wait the cooling-off window like
   everyone else.

The cooling-off does not apply to non-`@pulumi/*` deps; those flow through
Dependabot's standard major-version-ignore-list (see
[`.github/dependabot.yml`](./.github/dependabot.yml)).

## Transitive-supply-chain disclosure

| Dep                          | Provenance today | Compensating control                       |
| ---------------------------- | ---------------- | ------------------------------------------ |
| `@pulumi/pulumi`             | npm — no SLSA    | exact-pin + cooling-off + integrity hashes |
| `@pulumi/aws`                | npm — no SLSA    | exact-pin + cooling-off + integrity hashes |
| `@pulumi/policy`             | npm — no SLSA    | exact-pin (no upstream changes likely)     |
| `@pulumi/github`             | npm — no SLSA    | exact-pin + cooling-off + integrity hashes |
| `@pulumi/kubernetes`         | npm — no SLSA    | exact-pin + cooling-off + integrity hashes |
| `@pulumi/cloudflare`         | npm — no SLSA    | exact-pin + cooling-off + integrity hashes |
| `@aws-sdk/*`                 | npm — no SLSA    | exact-pin in lockfile + integrity hashes   |
| `simple-git`                 | npm — no SLSA    | exact-pin in lockfile + integrity hashes   |
| `p-timeout`                  | npm — no SLSA    | exact-pin in lockfile + integrity hashes   |
| GitHub Actions reusable wf's | varies           | pinned to exact 40-char SHA in workflows   |

We track a maintainer follow-up to file an upstream
`actions/attest-build-provenance` PR with `pulumi/pulumi-aws` once their
release pipeline supports it; until that lands, the cooling-off + exact-pin

- integrity-hash combo is our defense-in-depth.

## SCP deployment guidance

[`docs/deployment/scp.json`](./docs/deployment/scp.json) ships as a
ready-to-apply AWS Organizations Service Control Policy that protects the
`hulumi:iac-role=true` tag from non-IaC principals. With the SCP applied,
only the IaC role list named in the SCP can add or remove the tag — making
the tag tamper-evident at AWS level and pairing with `HulumiHardeningPack`
H3 (mandatory in v1.0.0).

Without the SCP applied, H3 still fires at preview time, but a non-IaC
principal could add the tag to itself to bypass. Apply the SCP for
production confidence. See [`docs/deployment/scp-guide.md`](./docs/deployment/scp-guide.md)
for customization, validation, application, and revert procedures.

## Privacy

Hulumi does not transmit telemetry. The `/hulumi-threat-model` skill writes
only to the user's local filesystem. The drift classifier (`@hulumi/drift`)
reads AWS APIs directly from the user's credentials and writes only to
`.hulumi/drift-cache/` on disk with `chmod 0600`. Foreign-UID cache files
are refused on read.

## Security defaults for contributors

- Every PR runs the supply-chain gates: `lint:exact-pin-guard`,
  `lint:license-boundary`, `pulumi-cooling-off`, DCO sign-off.
- Every release runs `actions/attest-build-provenance` for SLSA Build L3
  attestation, plus npm `--provenance` for the second Sigstore signature.
- All six published packages ship the same version on the same day —
  enforced by `release-readiness.test.ts`.
- License-boundary lint blocks verbatim CCM / AICM / CAIQ / CIS Benchmark /
  NIST control text from `packages/*/src/` and `skills/`. Cite frameworks
  by ID + URL only.
- New runtime dependencies require a written supply-chain rationale (see
  [CONTRIBUTING.md § "No runtime dependency additions without discussion"](./CONTRIBUTING.md#no-runtime-dependency-additions-without-discussion)).
