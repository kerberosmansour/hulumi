# Ticket 71: Align SLSA Build L3 Release Isolation

## GitHub Issue

- Issue: <https://github.com/kerberosmansour/hulumi/issues/71>
- Title: `release.yml: SLSA Build L3 isolation gap — id-token:write on same job as npm publish`
- Workpad comment: <https://github.com/kerberosmansour/hulumi/issues/71#issuecomment-4464352388>

## Contract Block

| Field | Contract |
| --- | --- |
| Problem | The release workflow currently builds tarballs, generates SBOMs, attests provenance, and publishes npm packages in one job that holds `id-token: write`. Public docs claim SLSA Build L3, but GitHub's native L3 pattern requires the provenance signing lane to be isolated from the user-controlled build steps through a reusable workflow. |
| Outcome | Release artifacts are built in a job without `id-token: write`; provenance signing, npm trusted publishing, and GitHub release creation happen in `.github/workflows/sign-and-publish.yml`, called as a reusable workflow with `id-token: write` + `attestations: write`. Current public docs describe the reusable workflow/v4 attestation lane accurately. |
| Non-goals | Do not change package versions, npm package names, package contents, SBOM format, Pulumi dependency pins, release trigger semantics, or historical `docs/slo/**` milestone records outside this ticket file. Do not author custom CodeQL, Semgrep, or secret-scanning rules. |
| Scope allow-list | `.github/workflows/release.yml`; `.github/workflows/sign-and-publish.yml`; `.github/attestations/README.md`; `SECURITY.md`; `docs/development.md`; `docs/cookbooks/verify-provenance.md`; `docs/launch/pulumi-blog-pitch.md`; `packages/baseline/README.md`; `packages/policies/README.md`; `packages/k8s-baseline/README.md`; `packages/k8s-baseline/tests/release-readiness.test.ts`; `packages/cloudflare-baseline/README.md`; `packages/platform-patterns/README.md`; `tests/skill-bdd/release-slsa-isolation.test.ts`; `tests/skill-bdd/workflow-action-pinning.test.ts`; this ticket file. |
| Compatibility | The tag trigger stays `v*.*.*`; the six-package atomic publish set stays unchanged; `npm publish --provenance --access public` stays the only publish path; no `NPM_TOKEN` or `NODE_AUTH_TOKEN` is introduced. |
| Verification | Add BDD tests before implementation. Run the focused tests, workflow governance lint, exact-pin guard, license-boundary lint, typecheck/lint for `@hulumi/tests-skill-bdd`, format check, and `git diff --check`. |

## BDD Scenarios

| Scenario | Expected red state | Expected green state |
| --- | --- | --- |
| Build job is isolated from OIDC signing | Current `attest-and-publish` job contains build/install/pack/SBOM commands and `id-token: write` in one job. | `build-release-artifacts` builds and uploads artifacts without `id-token: write`; `sign-and-publish` delegates to `.github/workflows/sign-and-publish.yml`. |
| Reusable signing workflow owns attestation + publish | No reusable workflow exists, so no isolated signing lane can be asserted. | `.github/workflows/sign-and-publish.yml` has `workflow_call`, downloads the build artifact, verifies `tarballs-sha256.txt`, attests `.tgz` files, publishes with npm provenance, and does not run build/pack/SBOM commands. |
| Local reusable workflow references are handled deliberately | Existing SHA-pinning BDD treats every `uses:` line as an external action, so a local reusable workflow call would fail. | SHA-pinning BDD skips local reusable workflow refs while continuing to require exact 40-character SHA pins for external actions and reusable workflows. |

## Evidence Log

| Check | Command | Expected | Actual Result | Status |
| --- | --- | --- | --- | --- |
| Red test | `pnpm --filter @hulumi/tests-skill-bdd test -- release-slsa-isolation.test.ts workflow-action-pinning.test.ts` | New SLSA-isolation BDD fails before workflow changes. | Failed as expected: old `attest-and-publish` job present; `sign-and-publish.yml` missing; docs still had old v2/direct wording. | pass |
| Focused BDD | `pnpm --filter @hulumi/tests-skill-bdd test -- release-slsa-isolation.test.ts workflow-action-pinning.test.ts` | pass | 2 files passed; 7 tests passed. | pass |
| Full skill BDD | `pnpm --filter @hulumi/tests-skill-bdd test` | pass | 11 files passed; 65 tests passed; 2 skipped. Existing threat-model fixture fallback warnings emitted. | pass |
| K8s release readiness | `pnpm --filter @hulumi/k8s-baseline test -- tests/release-readiness.test.ts` | pass | 1 file passed; 32 tests passed. | pass |
| Full K8s tests | `pnpm --filter @hulumi/k8s-baseline test` | pass | 16 files passed; 197 tests passed; command exited 0. Vitest reported existing unhandled rejection noise in fail-closed secret tests. | pass |
| Skill BDD typecheck | `pnpm --filter @hulumi/tests-skill-bdd typecheck` | pass | passed. | pass |
| Skill BDD lint | `pnpm --filter @hulumi/tests-skill-bdd lint` | pass | Initially failed on `no-regex-spaces`; fixed regexes; rerun passed. | pass |
| K8s typecheck | `pnpm --filter @hulumi/k8s-baseline typecheck` | pass | passed. | pass |
| K8s lint | `pnpm --filter @hulumi/k8s-baseline lint` | pass | passed. | pass |
| Workflow governance | `pnpm run lint:workflow-governance` | pass | `workflow-governance: pass`. | pass |
| Exact pin guard | `pnpm run lint:exact-pin-guard` | pass | `exact-pin-guard: OK (13 pinned deps match expected integrity hashes)`. | pass |
| License boundary | `pnpm run lint:license-boundary` | pass | `license-boundary-lint: OK`. | pass |
| Format | `pnpm run format:check` | pass | Initially flagged `.github/attestations/README.md`; targeted Prettier run; rerun passed. | pass |
| Diff whitespace | `git diff --check` | pass | passed. | pass |

## Source Notes

- SLSA Build v1.2 requirements distinguish Build L3 by unforgeable provenance and build isolation: <https://slsa.dev/spec/v1.2/build-requirements>.
- GitHub's Artifact Attestations guidance describes reusable workflow signing as the GitHub-native step from Build L2-with-provenance toward Build L3: <https://github.blog/enterprise-software/devsecops/enhance-build-security-and-reach-slsa-level-3-with-github-artifact-attestations/>.
