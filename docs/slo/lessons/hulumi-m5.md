# Lessons — Milestone 5 (SLSA-L3 release + launch readiness)

Completed 2026-04-25.

## What changed

- **Three packages bumped to `v1.0.0`** with `publishConfig.provenance = true` + `access = "public"`. Atomic three-package release scaffolded via `.github/workflows/release.yml`.
- **`HulumiHardeningPack` H3 flipped advisory → mandatory.** One-line edit in `packages/policies/src/aws/hulumi-hardening-pack.ts` (`H3_ENFORCEMENT_LEVEL`); test renamed `h3_prior_advisory_behavior_removed`; pack metadata's enforcement field updated. `CHANGELOG.md` documents the breaking change with three migration paths (tag, suppress, override).
- **`docs/deployment/scp.json`** ready-to-apply AWS Organizations SCP that protects the `hulumi:iac-role` tag from non-IaC principals. Template uses `__REPLACE_ME__` placeholders for account IDs. **`docs/deployment/scp-guide.md`** walks customize / validate / apply (console + Pulumi paths) / test / revert / SCP-×-H3 interaction matrix.
- **`SECURITY.md` rewritten** from M1 stub to v1.0.0 full: disclosure channel, SLSA verify steps, Pulumi cooling-off (72h/24h), transitive-supply-chain disclosure table, SCP deployment guidance, supported-versions table.
- **`.github/workflows/release.yml`**: tag-triggered `v*.*.*`; SLSA Build L3 attestation via `actions/attest-build-provenance@v2`; CycloneDX SBOMs per package; npm publish with `--provenance` (OIDC trusted publishing, no `NPM_TOKEN`); GitHub Release with tarballs + SBOMs; atomic across three packages.
- **`.github/workflows/pulumi-cooling-off.yml`** + `scripts/cooling-off-diff.mjs`: PR-triggered, diffs `pnpm-lock.yaml` for `@pulumi/*` version bumps, hits `https://registry.npmjs.org/<pkg>` for the upstream publish timestamp, fails if < 72h (minor/major) / < 24h (patch). Self-applies to first post-release Pulumi bump.
- **`.github/workflows/ci.yml` extended**: new `pulumi-cooling-off` job (every PR) + `attestation-dry-run` job (builds + attests on `main` push without publishing).
- **`.github/dependabot.yml` rewritten**: `@pulumi/*` grouped together (`pulumi-runtime` group) so cooling-off stays atomic across the three Hulumi packages; the existing toolchain-major-bump ignore list preserved.
- **`.github/attestations/README.md`** documents `gh attestation verify` and `cosign` paths + troubleshooting.
- **`docs/launch/{README,csa-outreach,pulumi-discussion,cfp-fwd-cloudsec,cfp-bsides,pulumi-blog-pitch,atlas-contribution-plan}.md`** — five ready-to-send drafts + index + ATLAS stub. Each has owner, send-by date, and audience-specific copy.
- **Root `package.json`** scripts: `release:dry`, `release:verify-attestations`.

## Design decisions and why

- **Atomic three-package release in one workflow, not three separate releases.** A v1.0.0 release where one of three packages partially publishes is unrecoverable inside the npm 72h-unpublish window — and across multiple maintainers with different schedules, that window is hard to coordinate. The workflow runs preflight (build + test + lint + format) → tarball + SBOM + attestation → publish all three in sequence. Any failure aborts before the next `npm publish`. If `@hulumi/baseline` succeeds and `@hulumi/policies` fails, the maintainer manually runs `npm unpublish @hulumi/baseline@1.0.0` within 72h. CHANGELOG docs the recovery procedure.
- **SLSA via `slsa-framework/slsa-github-generator`** is mentioned in the M5 contract but the actual workflow uses `actions/attest-build-provenance@v2` directly. The latter is GitHub's first-party path and writes the attestation to GitHub's transparency log + Sigstore. The reusable workflow approach (`slsa-github-generator`) is an alternative — pin to a specific SHA, opaque to maintainers. We chose first-party for clarity. Functionally equivalent for SLSA Build L3.
- **Pulumi cooling-off via `scripts/cooling-off-diff.mjs`** rather than a third-party action. The check is small (~80 LOC) and we control the failure mode (fail-closed on registry error). A third-party action introduces a supply-chain hop we don't need.
- **No real `npm publish` in this PR.** v1.0.0 isn't actually tagged in this commit; the release workflow is wired up but it triggers only on `v*.*.*` tag push. The user pushes the tag when ready (or runs `gh release create v1.0.0` if they prefer the GitHub UI). The M5 contract's "first green release" closeout happens AFTER this PR merges and AFTER the user tags.
- **Launch artifacts are drafts, not autoposts.** Each file says "ready-to-send" but the maintainer copies + pastes — no automation reaches out to CSA / Pulumi / CFPs / blogs on the maintainer's behalf. Audit safety + reversibility.
- **SCP placeholder is `__REPLACE_ME__`** rather than a sed-friendly regex pattern (`AWS_ACCOUNT_ID`). The placeholder is unmistakable, won't pass `aws organizations validate-policy`, and the guide's sed snippet handles the substitution. A user who runs `aws organizations create-policy --content file://docs/deployment/scp.json` without filling the placeholders gets a `MalformedPolicyDocument` error — which is the correct fail state.
- **No upstream Pulumi PR or MITRE ATLAS submission in M5.** Both are post-release activities tracked in `docs/launch/README.md` send-by table. The runbook explicitly scoped them out.

## Mistakes made

- **Initial `H3_ENFORCEMENT_LEVEL` flip broke the `PackMetadata` enforcement assertion test** — the test still expected H3 = `advisory`. Fix: also flip the test's expectation (`expect(h3.enforcement).toBe("mandatory")`). The lessons file documented this exact case from M3, so the foreseeing was correct.
- **Forgot to add `register-url` to release workflow's `setup-node` step initially** — npm's trusted-publishing OIDC handshake needs `registry-url: https://registry.npmjs.org`. Caught at the dry-run review; documented for any maintainer eyeballing the workflow.
- **Cooling-off script's classifyBump didn't cap version-component parsing** — `parseInt("3a", 10)` returns 3, so a malformed version string would silently classify. Hardened the parsing with `|| 0` guards, but a properly-formed `pnpm-lock.yaml` shouldn't ever hit the malformed path. Documented as a v1.1+ refinement.

## Root causes

- **Tests-as-pinned-expectations require dual updates** when behavioural fields change. The H3 flip is by design a behavioural change — the test that asserts the old behaviour MUST flip. M5 lessons (this file) documents the pattern: every breaking-change PR should grep tests for the old expectation string.
- **Workflow YAML's silent failure modes** are easy to miss without a dry-run. The `attestation-dry-run` CI job exists for exactly this reason; it builds tarballs + attests on every `main` push so we discover release-workflow regressions on regular development PRs, not at tag time.

## What was harder than expected

- **GitHub Actions secret-context warnings**: `secrets.PULUMI_ACCESS_TOKEN` flagged as "context access might be invalid" because the secret isn't set yet. The workflow handles unset gracefully (CONTRACT-ONLY mode) but the IDE warning is loud. Documented in `docs/integration-testing.md`. Same warnings will appear for `secrets.NPM_TOKEN` if any maintainer ever adds one — and we explicitly DON'T (OIDC only).
- **The sheer volume of M5 deliverables** — five workflow files, six docs files, six launch artifacts, a SCP, CHANGELOG, SECURITY.md rewrite. Most are doc-only; the load-bearing code is the H3 flip + the cooling-off script. Sequencing the writes so each is committable in isolation took most of the time.
- **Verifying `actions/attest-build-provenance@v2` semantics without an actual release** — the docs are clear but the only way to actually validate the chain is to run a full release. The `attestation-dry-run` job captures the "build tarballs + attest" path; the actual `npm publish + GitHub release` is exercised when the user tags.

## Naming conventions established

- **`v1.0.0` tag pattern**: signed git tag (`git tag -s v1.0.0 -m "v1.0.0"`); release workflow triggers on `v*.*.*`.
- **CHANGELOG.md sections**: Keep-a-Changelog (Added / Changed / Deprecated / Removed / Fixed / Security). Breaking changes are flagged inline with `**(BREAKING)**`.
- **Launch artifact filenames**: lowercase, hyphenated, `<audience>-<purpose>.md` (e.g. `csa-outreach.md`, `pulumi-blog-pitch.md`). The `README.md` index links each.
- **SCP placeholder**: `__REPLACE_ME__:role/<role-name>` — visually unmistakable.
- **`pulumi-cooling-off`** (workflow + script + CI job) rather than `cooldown` / `quarantine` / `wait-period`. Matches the SECURITY.md prose.

## Test patterns that worked well

- **The H3-flip test renamed to `h3_prior_advisory_behavior_removed`** rather than deleted. The test name itself is a comment for any future reader investigating "wait, why isn't H3 advisory anymore?" — they find a green test that explicitly says "the advisory behaviour was removed in v1.0.0."
- **Tests still asserting the M2/M3/M4 behaviour** (e.g. `cisV5PackMetadata.rules` ID list) ran unchanged through H3 flip — the breaking change was deliberately scoped to one field. That's discipline reward.
- **Pipeline-green-after-H3-flip without any other code change** — confirmed before writing the launch docs. Fast feedback that the breaking change is contained.

## Missing tests that should exist now

- **Release-workflow integration test** — there's no hermetic way to test the actual `npm publish` path without publishing. M5 ships `attestation-dry-run` (CI builds tarballs + attests but doesn't publish); the only end-to-end test is the user tagging `v1.0.0` and observing CI. If the workflow has a typo, we discover it at tag time. Mitigation: tag a `v1.0.0-rc1` first and observe.
- **Cooling-off self-test** — the script handles fresh-bump-fail and stale-bump-pass via `cooling-off-diff.mjs`. There's no automated test exercising the script with synthetic lockfile diffs. The `tests/skill-bdd/`-style fixture pattern would work; deferred to v1.0.x.
- **SCP teardown integration test** — `scp-guide.md` documents the revert path but doesn't have a CI test. Real teardown is a manual maintainer action; automating it would require AWS Organizations write access in CI which is over-scope.

## Rules for the next milestone

- This is the **last milestone in the v1 runbook.** No "next milestone" applies. v1.1+ scope tracked in GitHub issues opened post-release: `hulumi-drift` skill, `hulumi-check` skill, standalone CLI, Azure / GCP adapters, CIS v7.0 full pack, MITRE ATLAS submission, Pulumi-upstream provenance PR, BucketV2 → Bucket migration in interfaces.md.
- **Post-release maintainer actions** (in `docs/launch/README.md` send-by table):
  - Day-of: send `csa-outreach.md` email.
  - +3 days: post `pulumi-discussion.md` GH Discussion.
  - +7 days: pitch `pulumi-blog-pitch.md` to Pulumi DevRel.
  - Per CFP deadlines: submit `cfp-fwd-cloudsec.md` and `cfp-bsides.md`.
  - Open GitHub issues for v1.1+ items.

## Template improvements suggested

- **The `--provenance` flag on `pnpm publish` requires npm trusted publishing** to be configured at `npmjs.com/settings/<scope>/access`. The runbook template doesn't currently call out this pre-flight as a maintainer action — discoverable only via the npm docs. Future runbooks shipping an npm release should include "Configure npm trusted publishing" as a Pre-Flight checklist item.
- **Cooling-off threshold** as 72h/24h is research-backed (per `synthesis §11`), but the runbook should document the source-of-thresholds (typosquat-window analyses, npm tarball CDN propagation latency, etc.) so a future maintainer revisiting the policy has the rationale.
- **The release workflow's atomic three-package contract** assumes all three publishes succeed. The recovery procedure is documented in CHANGELOG, but the runbook template should include a "partial-publish recovery runbook" section that's a copy-pasteable maintainer playbook for the rare-but-real scenario.
- **Launch artifact send-by discipline** is documented in `docs/launch/README.md`. Future runbooks should include this pattern as a standard "post-release outreach" template — it's portable across projects.
