# Verifying Hulumi attestations

Every Hulumi tarball published from v1.0.0 carries an
`actions/attest-build-provenance` v2 attestation. This document
covers verification via `gh attestation verify` and `cosign`.

## Method 1: `gh attestation verify` (recommended)

```sh
# Download the tarball
pnpm pack @hulumi/baseline@1.3.0 --pack-destination .

# Verify the attestation
gh attestation verify ./hulumi-baseline-1.3.0.tgz \
  --repo kerberosmansour/hulumi
```

Expected output:

```
Loaded digest sha256:<sha> for file://./hulumi-baseline-1.3.0.tgz
Loaded 1 attestation from GitHub API
✓ Verification succeeded!

The following policy criteria were satisfied:
- Subject digest matches
- Repo: kerberosmansour/hulumi
- Workflow: .github/workflows/release.yml
- Commit: <sha>
```

Repeat for the other published packages in the same version train:
`@hulumi/policies`, `@hulumi/drift`, `@hulumi/k8s-baseline`,
`@hulumi/cloudflare-baseline`, and `@hulumi/platform-patterns`.

A non-zero exit code from `gh attestation verify` means the
attestation chain doesn't tie back to this repo's release
workflow. **Do not install the package.** Report through
[GitHub's private security advisory flow](https://github.com/kerberosmansour/hulumi/security/advisories/new).

## Method 2: `cosign` (offline)

If you can't reach the GitHub API:

```sh
# Download the tarball + the attestation
pnpm pack @hulumi/baseline@1.3.0 --pack-destination .
gh release download v1.3.0 \
  --repo kerberosmansour/hulumi \
  --pattern "hulumi-baseline-1.3.0.tgz.intoto.jsonl" \
  --dir .

# Verify with cosign (assumes a recent cosign + Sigstore root)
cosign verify-blob \
  --bundle ./hulumi-baseline-1.3.0.tgz.intoto.jsonl \
  --certificate-identity-regexp '^https://github.com/kerberosmansour/hulumi/' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ./hulumi-baseline-1.3.0.tgz
```

## What attestation guarantees

- The tarball was built by GitHub Actions running
  `.github/workflows/release.yml` from the
  `kerberosmansour/hulumi` repo.
- The exact commit SHA at build time matches the release tag.
- The build was hermetic (no maintainer-side `npm publish`).
- The publish used npm trusted publishing (OIDC); no
  long-lived `NPM_TOKEN` was involved.

## What it does NOT guarantee

- That the source code is free of vulnerabilities. SLSA L3 is a
  build-integrity property, not a code-correctness one.
- That `@pulumi/*` transitive dependencies were built with
  attestations — they are not, today (see SECURITY.md
  "Transitive-supply-chain disclosure").

## Troubleshooting

| Symptom                                                   | Likely cause                                | Fix                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `gh attestation verify` fails with "no attestation found" | tarball downloaded from a typosquat         | Verify package name / scope; re-download from `@hulumi/*`                                                                 |
| cosign reports "rekor entry not found"                    | offline transparency-log fallback expired   | Use `gh attestation verify` (online path); or fetch the bundle within 90 days of release                                  |
| The verified workflow path does NOT match release.yml     | possible compromised release infrastructure | DO NOT install. Report via [GitHub Security Advisory](https://github.com/kerberosmansour/hulumi/security/advisories/new). |
