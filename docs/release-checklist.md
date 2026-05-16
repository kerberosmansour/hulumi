---
title: Hulumi release checklist
description: Manual release gates for the six-package Hulumi release train, including the Claude Code skill demo gate and SLSA provenance verification.
---

# Hulumi release checklist

Run this checklist for every tagged release. The automated workflows build, attest,
and publish the six npm packages, but the fresh Claude Code skill path is a manual
gate until a safe Claude Code harness exists in CI.

## Preconditions

- You are on `main` with the release commit already reviewed.
- `CHANGELOG.md` has the target version heading.
- `gh auth status` succeeds against `github.com`.
- `npm view @hulumi/baseline version` works from the machine you will use for
  verification.
- No npm package version is being released outside the atomic six-package set:
  `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`,
  `@hulumi/k8s-baseline`, `@hulumi/cloudflare-baseline`, and
  `@hulumi/platform-patterns`.

## Before tagging

### 1. Run the normal release readiness checks

```bash
pnpm install
pnpm -r build
pnpm -r typecheck
pnpm -r test
pnpm -r lint
pnpm run lint:license-boundary
pnpm run lint:exact-pin-guard
pnpm run format:check
```

### 2. Install the skill into a fresh Claude Code skill path

Use the release commit you intend to tag. Replace any old local copy so the
demo is not accidentally using a stale skill.

```bash
mkdir -p ~/.claude/skills
if [ -d ~/.claude/skills/hulumi-threat-model ]; then
  mv ~/.claude/skills/hulumi-threat-model \
    ~/.claude/skills/hulumi-threat-model.backup-$(date +%Y%m%d%H%M%S)
fi
cp -R skills/hulumi-threat-model ~/.claude/skills/hulumi-threat-model
```

### 3. Invoke the skill in a fresh Claude Code session

Open a new Claude Code session from a throwaway working directory, then run one
AWS scenario and one GitHub scenario:

```text
/hulumi-threat-model aws-multi-account-baseline
/hulumi-threat-model github-actions-supply-chain
```

Confirm both generated files are written under that session's working
directory, have the expected fixed section headings, and cite framework IDs
only. Do not tag the release if the skill cannot be discovered from
`~/.claude/skills/hulumi-threat-model/` in the fresh session.

### 4. Run the installed-skill CLI smoke

Run the same entry points directly from the installed skill copy. Use a
throwaway directory because `generate-threat-model.mjs` writes into the current
working directory.

```bash
mkdir -p /tmp/hulumi-skill-smoke
cd /tmp/hulumi-skill-smoke
node ~/.claude/skills/hulumi-threat-model/scripts/list-scenarios.mjs
node ~/.claude/skills/hulumi-threat-model/scripts/generate-threat-model.mjs aws-multi-account-baseline
test -f docs/threat-model-aws-multi-account-baseline-$(date +%Y%m%d).md
```

The scenario list must include the nine IDs from `skills/hulumi-threat-model/SKILL.md`.
The generated threat model must keep the locked schema: `Scenario`, `Actors`,
`Assets`, `Threats (STRIDE)`, `Control Citations`,
`Recommended Hulumi Components`, and `Open Questions`.

### 5. Tag the release

```bash
git tag v<x.y.z>
git push origin v<x.y.z>
```

Do not announce the release yet. Wait for `.github/workflows/release.yml` and
the reusable `.github/workflows/sign-and-publish.yml` workflow to finish.

## After publish, before announcement

### 6. Verify every published tarball attestation

Set the version that was just published, then verify all six tarballs against
the canonical repository. This expands the root `release:verify-attestations`
script into one command per package so omissions are visible during manual
review.

```bash
VERSION=<x.y.z>
DEST=$(mktemp -d /tmp/hulumi-release-attestations.XXXXXX)

npm pack "@hulumi/baseline@$VERSION" --pack-destination "$DEST" --json
gh attestation verify "$DEST/hulumi-baseline-$VERSION.tgz" --repo kerberosmansour/hulumi

npm pack "@hulumi/policies@$VERSION" --pack-destination "$DEST" --json
gh attestation verify "$DEST/hulumi-policies-$VERSION.tgz" --repo kerberosmansour/hulumi

npm pack "@hulumi/drift@$VERSION" --pack-destination "$DEST" --json
gh attestation verify "$DEST/hulumi-drift-$VERSION.tgz" --repo kerberosmansour/hulumi

npm pack "@hulumi/k8s-baseline@$VERSION" --pack-destination "$DEST" --json
gh attestation verify "$DEST/hulumi-k8s-baseline-$VERSION.tgz" --repo kerberosmansour/hulumi

npm pack "@hulumi/cloudflare-baseline@$VERSION" --pack-destination "$DEST" --json
gh attestation verify "$DEST/hulumi-cloudflare-baseline-$VERSION.tgz" --repo kerberosmansour/hulumi

npm pack "@hulumi/platform-patterns@$VERSION" --pack-destination "$DEST" --json
gh attestation verify "$DEST/hulumi-platform-patterns-$VERSION.tgz" --repo kerberosmansour/hulumi
```

Every `gh attestation verify` command must report a successful verification for
`kerberosmansour/hulumi`. If any package fails verification, do not announce the
release and follow the responsible-disclosure path in `SECURITY.md`.

### 7. Close the release loop

- Confirm the npm versions are visible for all six packages.
- Confirm the GitHub release points at the intended tag.
- Publish any prepared GitHub Security Advisories for fixes included in the
  release.
- Add the release checklist outcome to the release issue or PR.
- Announce the release only after the fresh-session skill gate, CLI smoke, and
  all six attestation checks have passed.

## See also

- [Development guide](./development.md#releasing)
- [Verify SLSA provenance on a `@hulumi/*` tarball](./cookbooks/verify-provenance.md)
- [Security policy](../SECURITY.md)
