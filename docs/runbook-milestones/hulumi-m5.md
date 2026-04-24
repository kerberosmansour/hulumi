# Milestone 5 — SLSA-L3 release + launch readiness + cross-repo UDM binding

Parent runbook: [docs/RUNBOOK-hulumi.md](../RUNBOOK-hulumi.md).

**Goal**: After M5, the Hulumi repo has shipped **v1.0.0 to npm** with SLSA Build L3 attestation on every package (`@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift`), a complete `SECURITY.md` codifying 72h minor/major + 24h patch Pulumi cooling-off (CI-enforced), a ready-to-apply SCP at `docs/deployment/scp.json` protecting the `hulumi:iac-role` tag, launch-readiness artifacts in `docs/launch/` (CSA outreach, Pulumi GitHub Discussion, CFPs, Pulumi blog pitch), **H3 advisory → mandatory** (drift classifier now consumes the tag), and TauriMobile's [`docs/SUNLIT-GUARDIAN-UNIFIED-MIGRATION-RUNBOOK.md`](../SUNLIT-GUARDIAN-UNIFIED-MIGRATION-RUNBOOK.md) updated to require `@hulumi/baseline.SecureBucket` for any new AWS bucket.

**Context**: M1–M4 built the library. M5 ships it to the world. [synthesis §11](../research/hulumi/synthesis.md) locked SLSA-L3 day-zero as compensating control. [synthesis §5](../research/hulumi/synthesis.md) requires CSA written confirmation before launch language finalizes — M5 starts that clock but does not block v1.0.0 (we ship IDs-only per documented boundary; update later if CSA confirms). Critique S1 + S6 + C3 + C4 collapse into M5 as "everything that ships once alongside the release." This is the **cross-repo milestone** per user's C4/E8 decision.

**Important design rule**: **SLSA-L3 attestation is non-optional for v1.0.0.** No release tag ships without `actions/attest-build-provenance` producing valid attestations on every npm tarball. Broken attestation fails the release workflow; tag not pushed; npm not published. The release is atomic — all three packages publish together or none do.

**Refactor budget**: `Minimal local refactor in packages/policies/src/aws/hulumi-hardening-pack.ts — H3 severity advisory → mandatory (one-field edit + test update). No other production refactor. Cross-repo TauriMobile edit is additive.`

## Contract Block

| Field                         | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inputs                        | GitHub Actions `release` workflow triggered by tag `v1.0.0` on Hulumi `main`. Requires: OIDC, npm trusted publishing (OIDC-backed, no NPM_TOKEN), SLSA generator reusable workflow, maintainer PGP key for tag signing. Cross-repo input: PR to TauriMobile editing UDM runbook.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Outputs                       | npm: `@hulumi/baseline@1.0.0`, `@hulumi/policies@1.0.0`, `@hulumi/drift@1.0.0` with SLSA L3 provenance + badges. GitHub release `v1.0.0` with signed tag, release notes, SBOMs (CycloneDX), attestation bundle. `docs/deployment/scp.json`. Five launch drafts. Merged TauriMobile PR.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Interfaces touched            | `HulumiHardeningPack` H3 severity: `advisory` → `mandatory`; message updated to cite SCP template (behavioural breaking change). **No changes to public TS types, enum values, signatures, tag schema, cache schema, or `DriftSource` set.** Everything in [interfaces.md](../design/hulumi/interfaces.md) stable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Files allowed to change       | **Hulumi repo** — **new**: `.github/workflows/{release,slsa-attest,pulumi-cooling-off}.yml`, `.github/attestations/README.md`, `SECURITY.md` (full; M1 stub), `docs/deployment/scp.json`, `docs/deployment/scp-guide.md`, `docs/launch/{csa-outreach,pulumi-discussion,cfp-fwd-cloudsec,cfp-bsides,pulumi-blog-pitch,README,atlas-contribution-plan}.md`, `CHANGELOG.md`, `.github/dependabot.yml` (full; M1 stub). **Edits**: `packages/policies/src/aws/hulumi-hardening-pack.ts` (H3 flip), `packages/policies/tests/hulumi-hardening-pack.test.ts`, `packages/*/package.json` (version 1.0.0, publishConfig), `packages/*/README.md` (Canonical install + attestation-verify), `README.md` (v1.0.0 notes), root `package.json` (scripts `release:dry`, `release:verify-attestations`), `.github/workflows/ci.yml` (cooling-off required check). **TauriMobile repo** — **edits**: `docs/SUNLIT-GUARDIAN-UNIFIED-MIGRATION-RUNBOOK.md` (new "IaC Component Requirements" section; migration steps referencing buckets require `SecureBucket`). |
| Files to read before changing | [synthesis §§5,6,9,11](../research/hulumi/synthesis.md); [dossier §regulatory/legal](../research/hulumi/dossier.md); [interfaces.md](../design/hulumi/interfaces.md); [critique §§C3,C4,E2,E8,S1,S4,S6](../critique/hulumi.md); lessons m1-m4; [SLSA on GH Actions](https://docs.github.com/actions/security-guides/using-artifact-attestations-and-reusable-workflows-to-achieve-slsa-v1-build-level-3); [attest-build-provenance](https://github.com/actions/attest-build-provenance); [slsa-github-generator](https://github.com/slsa-framework/slsa-github-generator); [CCM licensing FAQ](https://cloudsecurityalliance.org/artifacts/ccm-aicm-licensing-faq); TauriMobile UDM runbook end-to-end.                                                                                                                                                                                                                                                                                                                                           |
| New files allowed             | As listed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| New dependencies allowed      | Runtime: none. Dev/CI: action wirings pinned to exact SHAs; `cyclonedx-npm` (exact-pinned) for SBOMs; `cosign` action (exact SHA); `slsa-framework/slsa-github-generator` reusable workflow pinned to exact SHA.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Migration allowed             | `no` code migration. **Behavioural migration** for downstream users: H3 advisory → mandatory is breaking. Documented in CHANGELOG "Breaking changes" with migration steps (add tag OR apply SCP).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Compatibility commitments     | All public TS types, enum values, tag schema, cache schema, skill frontmatter unchanged from M4. Only behavioural change is H3 severity; explicit, documented, paired with SCP. `v1.0.0` establishes semver baseline.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Forbidden shortcuts           | (a) No release tag without SLSA attestation success — atomic abort. (b) No long-lived `NPM_TOKEN` — OIDC trusted publishing only. (c) No manual `npm publish` bypass — CI-only enforced. (d) No CSA confirmation gating the release. (e) No mandatory H3 without SCP in same release (paired). (f) No skipping DCO on cross-repo TauriMobile PR. (g) No bypassing cooling-off on the first post-release Pulumi bump (self-applies). (h) No SCP without teardown path in `scp-guide.md`. (i) No external publication of CFP / blog drafts in M5.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Out of Scope / Must Not Do

- No v1.1 features — `hulumi-drift` / `hulumi-check` skills, standalone CLI, Azure/GCP, CIS v7.0 enablement, auto-remediation.
- No Pulumi upstream SLSA PR — post-v1.0.0 follow-up tracked in SECURITY.md.
- No MITRE ATLAS contribution submission — post-v1.0.0; `docs/launch/atlas-contribution-plan.md` stub only.
- No external CFP / blog publication — drafts only.
- No waiting on CSA confirmation before release.
- No sandbox account bootstrap — operational, from M3.
- No adding new framework packs beyond what M3 shipped.

## Pre-Flight

1. Global Entry Rules.
2. Read `docs/lessons/hulumi-m{1,2,3,4}.md`; apply corrections.
3. Read files listed.
4. Copy Evidence Log template.
5. Re-state five load-bearing constraints: (i) SLSA-L3 on every published package, atomic three-package release; (ii) OIDC-only publish; (iii) H3 flip + SCP ship together; (iv) 72h/24h cooling-off CI-enforced on every Pulumi-bump including first post-release; (v) cross-repo TauriMobile edit is a separate DCO-signed PR.

## Files Allowed To Change

| File                                                                 | Planned Change                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SECURITY.md`                                                        | REWRITE: disclosure channel, 72h/24h cooling-off, `@pulumi/*` transitive-provenance gap (exact-pin + integrity hashes mitigation), typosquat-reporting with canonical org, attestation-verify steps, SCP template reference                                               |
| `.github/workflows/release.yml`                                      | NEW: tag-triggered; `slsa-framework/slsa-github-generator` exact-SHA pinned; `pnpm -r build`; SBOM via `cyclonedx-npm`; publish each with `--provenance` via OIDC; GitHub release with attestation bundle; atomic                                                         |
| `.github/workflows/slsa-attest.yml`                                  | NEW reusable: called by `release.yml`; `actions/attest-build-provenance@v2` exact-SHA pinned                                                                                                                                                                              |
| `.github/workflows/pulumi-cooling-off.yml`                           | NEW: PR-triggered; inspects `pnpm-lock.yaml` diff; any `@pulumi/*` bump → checks upstream npm publish timestamp; fails if < (72h minor/major, 24h patch). Required status check.                                                                                          |
| `.github/attestations/README.md`                                     | NEW: how to verify tarballs via `gh attestation verify` or `cosign`                                                                                                                                                                                                       |
| `.github/dependabot.yml`                                             | REWRITE: weekly Pulumi bumps; commit-message convention; grouped `@pulumi/*` for coherent cooling-off                                                                                                                                                                     |
| `CHANGELOG.md`                                                       | NEW: Keep-a-Changelog; v1.0.0 entry + breaking H3 mandatory + new SCP + SLSA-L3                                                                                                                                                                                           |
| `docs/deployment/scp.json`                                           | NEW ready-to-apply SCP: two statements — deny `iam:TagRole` with key `hulumi:iac-role` unless principal in named IaC role list; deny `iam:UntagRole` on roles already carrying tag except by same list. Parameterized placeholders.                                       |
| `docs/deployment/scp-guide.md`                                       | NEW: customize (placeholder replacement), apply via Orgs console or Pulumi `aws.organizations.Policy`, revert procedure, SCP × H3 interaction                                                                                                                             |
| `docs/launch/README.md`                                              | NEW: index + ownership + send-by dates                                                                                                                                                                                                                                    |
| `docs/launch/csa-outreach.md`                                        | NEW: ready-to-send email to `research@cloudsecurityalliance.org` asking written confirmation for ID-only citation                                                                                                                                                         |
| `docs/launch/pulumi-discussion.md`                                   | NEW: GH Discussion draft for `pulumi/pulumi` proposing sibling `pulumi-compliance-policies-frameworks` repo                                                                                                                                                               |
| `docs/launch/cfp-fwd-cloudsec.md`                                    | NEW: 300-word CFP — "Hardened Pulumi for the AI-Agent Era: What TLA+ Verification Taught Us About Drift"                                                                                                                                                                  |
| `docs/launch/cfp-bsides.md`                                          | NEW: shorter CFP for BSides, 20-min variant                                                                                                                                                                                                                               |
| `docs/launch/pulumi-blog-pitch.md`                                   | NEW: Pulumi blog guest-post pitch                                                                                                                                                                                                                                         |
| `docs/launch/atlas-contribution-plan.md`                             | NEW stub: MITRE ATLAS contribution plan (post-release task)                                                                                                                                                                                                               |
| `packages/policies/src/aws/hulumi-hardening-pack.ts`                 | EDIT: H3 severity `advisory` → `mandatory`; message references `scp.json` + `scp-guide.md`                                                                                                                                                                                |
| `packages/policies/tests/hulumi-hardening-pack.test.ts`              | EDIT: H3 expectation updated to mandatory; prior advisory renamed `h3_prior_advisory_behavior_removed`                                                                                                                                                                    |
| `packages/baseline/package.json`                                     | EDIT: `"version": "1.0.0"`, `"publishConfig": { "access": "public", "provenance": true }`, `"files"` excludes source TS                                                                                                                                                   |
| `packages/policies/package.json`                                     | EDIT: same                                                                                                                                                                                                                                                                |
| `packages/drift/package.json`                                        | EDIT: same                                                                                                                                                                                                                                                                |
| `packages/*/README.md`                                               | EDIT: "Canonical install" + attestation-verify snippet; policies README notes H3 mandatory in v1.0.0                                                                                                                                                                      |
| `README.md` (root)                                                   | EDIT: v1.0.0 announcement + install + SCP + dogfood reference                                                                                                                                                                                                             |
| Root `package.json`                                                  | EDIT: `release:dry` (via `act`), `release:verify-attestations` (downloads + `gh attestation verify`)                                                                                                                                                                      |
| `.github/workflows/ci.yml`                                           | EDIT: `pulumi-cooling-off` as required check; `attestation-dry-run` job builds + attests without publishing                                                                                                                                                               |
| **TauriMobile: `docs/SUNLIT-GUARDIAN-UNIFIED-MIGRATION-RUNBOOK.md`** | EDIT (cross-repo): new "IaC Component Requirements (added 2026-04 for Hulumi v1 dogfood)" section. Each migration step creating a new bucket requires `import { SecureBucket } from "@hulumi/baseline/aws"` + `tier: "startup-hardened"` default. Separate DCO-signed PR. |

## Step-by-Step

1. Write BDD stubs for M5 scenarios. Release-workflow tests via `act` or workflow-dispatch in a fork.
2. Author `SECURITY.md` full content first — reference point for other M5 artifacts.
3. Author `docs/deployment/scp.json` + `scp-guide.md`; validate SCP against AWS Organizations sandbox.
4. Flip H3 to mandatory; update tests; run M3 regression — expect renamed advisory test behavior.
5. Wire `pulumi-cooling-off.yml`; test on seeded PR (fresh bump fails; >72h passes).
6. Wire `release.yml` + `slsa-attest.yml`; configure npm trusted publishing (OIDC); PGP tag signing.
7. Dry-run release on a fork; iterate until attestations verify via `gh attestation verify`.
8. Author five launch artifacts in `docs/launch/` + index + atlas stub.
9. Bump packages to 1.0.0; update CHANGELOG; commit `chore(release): prepare v1.0.0`.
10. **Cross-repo TauriMobile PR**: separate PR updating UDM runbook. DCO sign-off.
11. Tag `v1.0.0`; release workflow fires; attestations; three packages publish atomically; GitHub release created with SBOMs + attestations.
12. Post-release verification: `pnpm install` in clean dir; `gh attestation verify` each tarball; confirm provenance badges on npm pages.
13. Merge TauriMobile UDM PR.
14. Write lessons + completion; update Milestone Tracker; close runbook.

## BDD Acceptance Scenarios

**Feature: v1.0.0 release ships atomically with SLSA-L3, H3 flip, SCP, cross-repo UDM dogfood; cooling-off CI enforces Pulumi hygiene**

| Scenario                                            | Category                         | Given                                                         | When                                                            | Then                                                                                                                                                                 |
| --------------------------------------------------- | -------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Release publishes all three atomically              | happy path                       | tag `v1.0.0` on `main`                                        | `release.yml` runs                                              | three packages `@hulumi/baseline@1.0.0`, `@hulumi/policies@1.0.0`, `@hulumi/drift@1.0.0` published with `provenance: true`; GitHub release with SBOMs + attestations |
| Release aborts atomically on attestation failure    | reliability / no partial publish | tag pushed; seeded attestation failure                        | workflow                                                        | fails before any `npm publish`; zero packages at `1.0.0` on npm; tag not marked released                                                                             |
| OIDC is only publish auth                           | supply chain                     | grep workflow for NPM_TOKEN                                   | `grep -E "NPM_TOKEN\|npm_token" .github/workflows/`             | zero hits; only `id-token: write` + trusted publishing                                                                                                               |
| Attestation verifiable                              | supply chain                     | downloaded tarball                                            | `gh attestation verify --repo kerberosmansour/hulumi <tarball>` | exits 0 for each of three                                                                                                                                            |
| SLSA Build L3 claim accurate                        | supply chain                     | attestation document                                          | parse `buildType` + `builder.id`                                | matches SLSA v1.1 Build L3 (hermetic, provenance, parameterless, isolated)                                                                                           |
| SBOM generated                                      | supply chain / compliance        | release workflow                                              | GitHub release assets                                           | three CycloneDX SBOMs + combined                                                                                                                                     |
| H3 flip produces mandatory violation                | behavioural migration            | stack passing at advisory in v0.x                             | upgrade to `@hulumi/policies@1.0.0` + preview                   | H3 now **mandatory**; preview fails until tag added OR SCP applied                                                                                                   |
| SCP JSON validates                                  | security (S4)                    | `docs/deployment/scp.json`                                    | `aws organizations validate-policy` in CI                       | `Valid: true`; type `SERVICE_CONTROL_POLICY`                                                                                                                         |
| SCP teardown guide followable                       | security / operational           | `docs/deployment/scp-guide.md`                                | manual check                                                    | has "Apply", "Customize", "Revert" sections + tested `aws organizations delete-policy` snippet                                                                       |
| Cooling-off fails on fresh bump                     | supply chain (E2, S6)            | PR bumping `@pulumi/aws` to version published 1h ago          | `pulumi-cooling-off.yml`                                        | fails "Pulumi package published <72h ago; cooling-off active until <date>" (minor); 24h threshold (patch)                                                            |
| Cooling-off passes on stale bump                    | supply chain                     | same PR with version >72h                                     | workflow                                                        | passes                                                                                                                                                               |
| Cooling-off self-applies on first post-release bump | supply chain                     | first Dependabot PR post-v1.0.0 bumping `@pulumi/aws`         | CI                                                              | cooling-off check runs; no bypass                                                                                                                                    |
| Cross-repo UDM PR lands                             | dogfood (C4, E8)                 | M5 completion                                                 | TauriMobile PR                                                  | merged; UDM runbook contains new "IaC Component Requirements" section                                                                                                |
| UDM section actionable                              | documentation                    | new section                                                   | reader check                                                    | has runnable TS snippet (SecureBucket import + instantiation), `tier: "startup-hardened"` default, @hulumi/baseline npm page link                                    |
| Launch artifacts complete                           | launch readiness (C3)            | `docs/launch/`                                                | check                                                           | 5 drafts ready-to-send with owners + send-by dates; atlas stub present                                                                                               |
| Typosquat canonical install                         | security (S1)                    | root README, SECURITY.md, three package READMEs               | check                                                           | each has "Canonical install" with single GitHub org + pinned v1.0.0 commit SHA + attestation-verify snippet                                                          |
| SECURITY.md discloses provenance gap                | transparency (S6, synthesis §11) | SECURITY.md                                                   | check                                                           | has "Transitive provenance" section explaining `@pulumi/*` lacks SLSA today + compensating controls + open issue ref                                                 |
| No NPM_TOKEN in repo secrets                        | supply chain                     | repo settings                                                 | `gh api repos/.../actions/secrets`                              | empty for publishing tokens; OIDC trust documented in `docs/deployment/trusted-publishing.md`                                                                        |
| Local `npm publish` fails by design                 | supply chain                     | maintainer runs `cd packages/baseline && npm publish` locally | publish                                                         | fails — 2FA + provenance required; doc-prescribed CI path only                                                                                                       |

## Regression Tests

- Full M1-M4 BDDs green on `main` BEFORE `v1.0.0` tag.
- `/hulumi-threat-model` installable via `git clone` (skill is NOT published to npm in v1 per agentskills.io convention).
- `SecureBucket` + `AccountFoundation` snapshots green and unchanged.
- Verdict-matrix BDD green; `DriftSource` unchanged.
- Weekly integration passes on first post-release Sunday.
- License-boundary lint green on launch docs (can reference CCM IDs but not embed prose).

## Compatibility Checklist

- [ ] `@hulumi/baseline` v1.0.0 matches [interfaces.md §1](../design/hulumi/interfaces.md).
- [ ] `@hulumi/policies` v1.0.0 matches [interfaces.md §2](../design/hulumi/interfaces.md).
- [ ] `@hulumi/drift` v1.0.0 matches [interfaces.md §3](../design/hulumi/interfaces.md).
- [ ] `DriftSource` enum unchanged from M4.
- [ ] Tag schema, cache schema, SKILL.md frontmatter unchanged.
- [ ] H3 `advisory→mandatory` documented in CHANGELOG breaking-changes with migration.
- [ ] `@pulumi/*` exact pins unchanged from M4 at release time.
- [ ] `pnpm install && pnpm -r build && pnpm -r test && pnpm -r lint && pnpm -r typecheck` green on Node 20 LTS.
- [ ] Each `package.json` has `publishConfig.provenance = true`, `access = "public"`.
- [ ] SBOM successfully generated for each package.

## E2E Runtime Validation

**File**: `.github/workflows/ci.yml` job `attestation-dry-run` (pre-tag)

| E2E Test                            | What It Proves               | Pass Criteria                                                 |
| ----------------------------------- | ---------------------------- | ------------------------------------------------------------- |
| `ci_attestation_dry_run`            | Attestation generation works | Succeeds for each of three; doc parses; correct repo + commit |
| `ci_slsa_reusable_workflow_pinned`  | Supply-chain hygiene         | Pinned to exact SHA not floating `@v1`                        |
| `ci_cooling_off_check_on_seeded_pr` | Cooling-off works            | Fresh bump fails; stale passes                                |

**File**: `tests/release-smoke/` (post-tag)

| E2E Test                              | What It Proves    | Pass Criteria                                                           |
| ------------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| `npm_install_works_for_all_three`     | Packages install  | `pnpm add @hulumi/baseline @hulumi/policies @hulumi/drift` in fresh dir |
| `attestation_verify_succeeds`         | Attestation valid | `gh attestation verify` exits 0 each                                    |
| `type_surface_matches_interfaces`     | API stability     | Assignability test on every stable-level symbol                         |
| `scp_json_validates_against_aws_orgs` | S4                | `aws organizations validate-policy` returns valid                       |

**File**: TauriMobile PR CI

| E2E Test                     | What It Proves            | Pass Criteria                                                                          |
| ---------------------------- | ------------------------- | -------------------------------------------------------------------------------------- |
| `udm_runbook_edit_is_merged` | Cross-repo binding landed | PR merged on `main`; new section present                                               |
| `udm_runbook_snippet_builds` | Example not vaporware     | `SecureBucket` snippet from new section compiles in a Pulumi TS program (manual smoke) |

## Smoke Tests

- [ ] `cd ~/Documents/Dev/GitHub/Hulumi && pnpm install && pnpm -r build && pnpm -r test && pnpm -r lint && pnpm -r typecheck` → green.
- [ ] `gh workflow run release.yml --ref v1.0.0-rc1` on release-candidate tag in a fork → attestation succeeds; no npm publish to main registry.
- [ ] Tag `v1.0.0`; observe release workflow; confirm three packages on npm within 10 min with provenance badges.
- [ ] `pnpm init hulumi-smoke && cd hulumi-smoke && pnpm add @hulumi/baseline@1.0.0 @hulumi/policies@1.0.0 @hulumi/drift@1.0.0` → all three install.
- [ ] `gh attestation verify --repo kerberosmansour/hulumi ./node_modules/@hulumi/baseline-*.tgz` → exits 0 (repeat for others).
- [ ] Review 5 launch drafts for tone + accuracy + identity; no PII, no un-filled placeholders.
- [ ] Apply `scp.json` (placeholders filled) in sandbox AWS Organization; attempt `iam:TagRole` with `hulumi:iac-role=true` as non-IaC principal → denied. Revert via guide's snippet → clean.
- [ ] Merge TauriMobile UDM PR; visually inspect `SUNLIT-GUARDIAN-UNIFIED-MIGRATION-RUNBOOK.md` renders.
- [ ] `git status` clean in both repos.

## Evidence Log

| Step                                  | Command / Check                                         | Expected                                | Actual | Pass/Fail | Notes |
| ------------------------------------- | ------------------------------------------------------- | --------------------------------------- | ------ | --------- | ----- |
| Baseline (M1-M4)                      | `pnpm -r test` pre-edits                                | green                                   |        |           |       |
| Release workflow drafted              | `release.yml` + `slsa-attest.yml`                       | SLSA reusable pinned to SHA             |        |           |       |
| Dry-run on fork                       | release candidate                                       | attestations generated; no real publish |        |           |       |
| H3 flip + test update                 | hulumi-hardening-pack                                   | suite green w/ new mandatory            |        |           |       |
| SCP JSON validated                    | `aws organizations validate-policy`                     | valid                                   |        |           |       |
| Cooling-off CI seeded                 | PR inside 72h                                           | fails; outside passes                   |        |           |       |
| Launch drafts                         | 5 files + README + atlas                                | all present                             |        |           |       |
| CHANGELOG v1.0.0                      | breaking-change note + migration                        |                                         |        |           |       |
| SECURITY.md rewrite                   | disclosure, cooling-off, provenance gap, typosquat, SCP | covered                                 |        |           |       |
| Cross-repo PR                         | merged                                                  | UDM runbook updated                     |        |           |       |
| Tag v1.0.0                            | `git tag v1.0.0 && git push --tags`                     | signed commit                           |        |           |       |
| Release workflow run                  | green; three published                                  |                                         |        |           |       |
| Attestation verify baseline           | `gh attestation verify` on npm tarball                  | exits 0                                 |        |           |       |
| Attestation verify policies           | same                                                    | exits 0                                 |        |           |       |
| Attestation verify drift              | same                                                    | exits 0                                 |        |           |       |
| SBOM artifacts                        | GitHub release                                          | three + combined                        |        |           |       |
| npm provenance badges                 | npm package pages                                       | all three show provenance               |        |           |       |
| H3 regression                         | install latest policies, preview M3 example             | mandatory violation fires               |        |           |       |
| SCP applied in sandbox org            | apply + test iam:TagRole                                | denied for non-IaC                      |        |           |       |
| Weekly integration first post-release | Sunday 04:00 UTC                                        | green                                   |        |           |       |
| Compatibility suite                   | M1-M4 regression                                        | green                                   |        |           |       |
| `git status`                          | both repos                                              | clean                                   |        |           |       |

## Definition of Done

- All M5 BDDs pass.
- Release workflow fired once on `v1.0.0` green.
- Three packages live on npm with provenance badges.
- `gh attestation verify` succeeds on each.
- SBOMs attached to GitHub release.
- H3 mandatory in shipped `@hulumi/policies@1.0.0`; CHANGELOG migration documented.
- `docs/deployment/scp.json` + `scp-guide.md` shipped; SCP validates.
- Cooling-off CI enforced; first post-release Pulumi-bump PR subject to check.
- 5 launch drafts + atlas stub in `docs/launch/`.
- TauriMobile PR merged; UDM requires `SecureBucket`.
- Full M1-M5 test suite green.
- Smoke tests checked.
- Compatibility complete.
- `git status` clean both repos.
- `docs/lessons/hulumi-m5.md` + `docs/completion/hulumi-m5.md` written.
- Milestone Tracker `done`.
- **v1.0.0 announcement on Hulumi README + GitHub Releases page.**

## Post-Flight

- **ARCHITECTURE.md** (Hulumi): final v1 state; Target Architecture folded into Overview.
- **README.md** (Hulumi): v1.0.0 announcement + install commands + provenance badge + SCP pointer + UDM dogfood note.
- **README.md** (TauriMobile): optional one-line reference to published Hulumi packages.
- **Other docs**: `docs/launch/README.md` tracks send-by dates; post-release actions — send CSA email, open Pulumi Discussion, submit CFPs within documented windows.

## Notes

- **Last milestone.** v1.1+ scope (hulumi-drift / hulumi-check skills, CLI, Azure/GCP, CIS v7.0 full, MITRE ATLAS submission, Pulumi upstream provenance PR) tracked in GitHub issues opened post-release.
- Pulumi upstream provenance PR + MITRE ATLAS contribution are follow-ups, not M5 scope. Filing immediately post-release is a maintainer action in `docs/launch/README.md`.
- CSA written confirmation paths all sized: (a) affirmative — no further work; (b) negative — v1.0.1 docs-only paraphrases; (c) no reply in 30 days — default to shipping as-is.
- Atomic three-package release: publish baseline → policies → drift in one workflow; any failure stops; partial failures require `npm unpublish` within 72h window.
