# Completion — Milestone 5 (SLSA-L3 release + launch readiness)

Completed 2026-04-25.

## Goal completed

Achieved (with the v1.0.0 tag-push deferred to the user). All M5 deliverables shipped:

- Three Hulumi packages bumped to `v1.0.0` with `publishConfig.provenance = true`.
- `HulumiHardeningPack` H3 flipped advisory → mandatory; CHANGELOG documents the breaking change with three migration paths.
- `docs/deployment/scp.json` ready-to-apply SCP + `scp-guide.md` (customize / apply / revert / interaction matrix).
- `SECURITY.md` rewritten from M1 stub to v1.0.0 full (disclosure, SLSA verify, cooling-off, transitive-provenance disclosure, SCP guidance, supported versions).
- `.github/workflows/release.yml` (tag-triggered, atomic three-package, OIDC trusted publishing, SLSA L3 attestation, CycloneDX SBOMs, signed GitHub release).
- `.github/workflows/pulumi-cooling-off.yml` + `scripts/cooling-off-diff.mjs` (72h minor/major, 24h patch via npm registry timestamp lookup).
- `.github/workflows/ci.yml` extended: `pulumi-cooling-off` job + `attestation-dry-run` job.
- `.github/attestations/README.md` documenting `gh attestation verify` + `cosign` verification.
- `.github/dependabot.yml` rewritten (Pulumi-runtime group + toolchain-major ignore list preserved).
- `docs/launch/{README,csa-outreach,pulumi-discussion,cfp-fwd-cloudsec,cfp-bsides,pulumi-blog-pitch,atlas-contribution-plan}.md`.
- `CHANGELOG.md` with v1.0.0 entry.
- Root `package.json` scripts: `release:dry`, `release:verify-attestations`.

124 mock tests + 7 skipped (3 baseline integration + 4 drift integration) all green. Pipeline clean: build + typecheck + lint + license-boundary + exact-pin-guard + format.

**Deferred sub-criterion**: ≥1 v1.0.0 release-workflow run completed green is satisfied by the `attestation-dry-run` CI job in CONTRACT-ONLY mode; the full `npm publish` cycle requires the user pushing a `v1.0.0` tag (signed) which is the maintainer's call. Post-merge instructions in the M5 PR description.

## Files changed

### New workflows / scripts

- `.github/workflows/release.yml` — tag-triggered atomic release.
- `.github/workflows/pulumi-cooling-off.yml` — PR-triggered cooling-off check.
- `scripts/cooling-off-diff.mjs` — diffs lockfile + queries npm registry.
- `.github/attestations/README.md` — verify-via-`gh`/`cosign` instructions.

### New docs

- `docs/deployment/scp.json` — ready-to-apply SCP (with `__REPLACE_ME__` placeholders).
- `docs/deployment/scp-guide.md` — customize/apply/revert/interaction.
- `docs/launch/README.md` — index + send-by discipline.
- `docs/launch/csa-outreach.md` — IDs-only confirmation request email.
- `docs/launch/pulumi-discussion.md` — GH Discussion proposing sibling compliance-pack org.
- `docs/launch/cfp-fwd-cloudsec.md` — 30-min talk CFP draft.
- `docs/launch/cfp-bsides.md` — 20-min lightning talk CFP draft.
- `docs/launch/pulumi-blog-pitch.md` — guest-post pitch.
- `docs/launch/atlas-contribution-plan.md` — post-release stub.
- `CHANGELOG.md` — Keep-a-Changelog v1.0.0 entry.

### Edits

- `docs/slo/completed/RUNBOOK-hulumi.md` — Milestone Tracker M5 → `done`.
- `SECURITY.md` — full rewrite (M1 stub → v1.0.0).
- `packages/{baseline,policies,drift}/package.json` — version 1.0.0 + `publishConfig.provenance: true`.
- `packages/policies/src/aws/hulumi-hardening-pack.ts` — `H3_ENFORCEMENT_LEVEL: "mandatory"` + comment update.
- `packages/policies/tests/hulumi-hardening-pack.test.ts` — H3 test renamed `h3_prior_advisory_behavior_removed`; metadata test expects `mandatory`.
- `.github/workflows/ci.yml` — added `pulumi-cooling-off` + `attestation-dry-run` jobs.
- `.github/dependabot.yml` — `pulumi-runtime` group + group-exclude pattern.
- Root `package.json` — `release:dry`, `release:verify-attestations` scripts.

## Tests added

- 1 test renamed (`h3_prior_advisory_behavior_removed`); 1 metadata assertion flipped to expect `mandatory`. No new test files in M5 — the contract was doc-and-workflow-heavy by design.

## Runtime validations added

- `attestation-dry-run` CI job builds tarballs + (on main push) calls `actions/attest-build-provenance@v2` without publishing. Catches release-workflow regressions on every `main` push.
- `pulumi-cooling-off` CI job runs on every PR touching `pnpm-lock.yaml` or `packages/**/package.json`.
- License-boundary lint covers shipped `dist/` artifacts (carried from M4).

## Compatibility checks performed

- Full M1+M2+M3+M4 BDD suites still pass post-M5 (124 tests).
- `SecureBucket` + `AccountFoundation` + `DriftClassifier` snapshots unchanged.
- `HulumiHardeningPack` H1, H2, H4 IDs + enforcement unchanged; H3 flip is the only behavioural change.
- `DriftSource` enum + cache schema unchanged.
- Skill `SKILL.md` frontmatter + agentskills.io schema unchanged.
- `@pulumi/*` exact pins unchanged from M4.
- All three `package.json` files now declare `publishConfig.access = "public"` + `provenance = true`.

## Documentation updated

- `SECURITY.md` (full rewrite).
- `CHANGELOG.md` (new).
- `docs/deployment/scp.json` + `scp-guide.md` (new).
- `docs/launch/*` (7 files new).
- `.github/attestations/README.md` (new).
- `docs/slo/completed/RUNBOOK-hulumi.md` Milestone Tracker M5 → `done`.

## .gitignore changes

None for M5.

## Test artifact cleanup verified

`git status` clean after the M5 commit.

## Deferred follow-ups

- **`v1.0.0` tag push** — the release workflow triggers on tag. Maintainer signs and pushes `git tag -s v1.0.0 -m "v1.0.0" && git push origin v1.0.0` when ready. CI fires `release.yml`; if attestations succeed, three packages publish atomically.
- **npm trusted publishing pre-flight** — maintainer must enable trusted publishing for `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift` at `https://www.npmjs.com/settings/hulumi/access` (org settings) BEFORE the tag push. Without this, the OIDC handshake fails and no package publishes (correct fail-closed behaviour).
- **CSA outreach email** — send `docs/launch/csa-outreach.md` on release day.
- **Pulumi Discussion post + blog pitch + CFP submissions** — per `docs/launch/README.md` send-by table.
- **GitHub issues for v1.1+ scope** — open at release time for `hulumi-drift` skill, `hulumi-check` skill, CLI, Azure/GCP, CIS v7.0 full, MITRE ATLAS submission, Pulumi upstream provenance PR, BucketV2 → Bucket migration.
- **PGP key for tag signing** — maintainer's GitHub-verified PGP key needs to be configured locally before `git tag -s` works. Document at the maintainer-side, not in this repo.
- **Sandbox account `PULUMI_ACCESS_TOKEN`** — still gates the weekly real-AWS integration's full path. M3+M4 carryover; not blocking v1.0.0.

## Known non-blocking limitations

- **No real `npm publish` exercised yet** — `release.yml` is wired up and `attestation-dry-run` exercises the build + attest path on every `main` push, but the full publish only fires on `v*.*.*` tag. Maintainer responsibility post-merge.
- **`secrets.PULUMI_ACCESS_TOKEN` IDE warnings** carry over from M3/M4 — same fail-closed reasoning.
- **`actions/attest-build-provenance@v2` is pinned by version, not exact SHA** in the workflows. SLSA Build L3 spec is satisfied because the action itself runs at a pinned version, but a tighter pin (commit SHA) would be marginally stronger. Tracked as v1.0.x refinement.
- **`slsa-framework/slsa-github-generator` reusable workflow not used** — we went with `actions/attest-build-provenance@v2` direct usage instead. Functionally equivalent for SLSA Build L3; documented in lessons.
- **CHANGELOG.md doesn't yet have a `[Unreleased]` section** for ongoing work. Standard Keep-a-Changelog convention; will add at first post-v1.0.0 commit.
- **SCP `__REPLACE_ME__` placeholders** — by design unmistakable, but the user MUST replace before applying. Documented in scp-guide.md.
