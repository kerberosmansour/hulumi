---
runbook_version: 4
id: hulumi-security-admission-integrity
prefix: security-admission-integrity
issues: [codex-security]
stack: Node.js 24, YAML 1.2, Vitest 4
tla_required: false
kani_required: false
security_libs_required: false
ai_component: false
compliance: [nist-800-53, nist-ssdf]
---

# Security admission integrity runbook

## Milestone tracker

| Milestone | Title                                                             | Status    | Contract                                                                                                                                                                        |
| --------- | ----------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1        | Structural dependency/workflow admission and no-follow generation | confirmed | Confirmed on 2026-10-15 under the operator's standing instruction to continue the SLO work autonomously, fix every reported vulnerability, and publish only after verification. |

## M1 contract

### Goal

Close four source-validated Codex Security findings before any product-policy
remediation relies on the affected CI controls:

- `csf_a65623d165990bd72713011c`: lockfile comment/nearby-text integrity bypass;
- `csf_47ae129cec10bd5ee9379778`: quoted/flow YAML and ownerless CODEOWNERS bypass;
- `csf_c2fb4c8c6e2e0533810592ac`: Cloudflare provider cooling-off omission; and
- `csf_09f52f28f57a62cf5260de30`: threat-model generator symlink escape.

The milestone replaces text-proximity security decisions with parsed structures,
uses one reviewed protected-dependency inventory, and makes generated writes
stay inside a caller-approved real directory without following pre-positioned
symlinks.

### Exact file allow-list

- `docs/RUNBOOK-security-admission-integrity.md`
- `docs/slo/critique/security-admission-integrity-m1.md`
- `package.json`
- `pnpm-lock.yaml`
- `scripts/protected-dependencies.mjs`
- `scripts/exact-pin-guard.mjs`
- `scripts/workflow-governance-lint.mjs`
- `scripts/cooling-off-diff.mjs`
- `tests/skill-bdd/exact-pin-guard.test.ts`
- `tests/skill-bdd/workflow-governance-lint.test.ts`
- `tests/skill-bdd/cooling-off-diff.test.ts`
- `tests/skill-bdd/fixtures/cooling-off-diff/**`
- `skills/hulumi-threat-model/SKILL.md`
- `skills/hulumi-threat-model/scripts/generate-threat-model.mjs`
- `tests/skill-bdd/hulumi-threat-model.test.ts`
- `docs/slo/verify/security-admission-integrity-m1.md`
- `docs/slo/lessons/security-admission-integrity-m1.md`
- `docs/slo/completion/security-admission-integrity-m1.md`

### Dependency admission

The candidate `yaml` package must be exact-pinned and admitted before it is
installed or executed. Resolve only the candidate lockfile with lifecycle
scripts disabled. Scan the full resolved graph with the repository's pinned
official OSV gate, review the lock diff, registry origin, integrity, publisher,
source repository, runtime dependency count, package scripts and authority, and
reject every advisory, `MAL-*`, scanner, network or parsing failure. The reviewed
candidate is `yaml@2.9.1`, published by the established `eemeli` maintainer from
`https://github.com/eemeli/yaml`, with zero runtime dependencies and no install
lifecycle script. These metadata observations are not an admission verdict;
the candidate lock and OSV evidence remain mandatory.

### Data and authority boundary

Inputs are repository-owned lockfiles, workflow YAML, CODEOWNERS, fixed threat
model data and caller-selected output roots. The lints have no secret, registry
write, GitHub write or cloud authority. Network is permitted only for the
existing cooling-off publication-time lookup and the pre-execution OSV scan.
Generated Markdown may replace only the exact regular file under a verified
real `docs/` directory; it may not follow a directory or target symlink.

### BDD acceptance scenarios

| ID       | Given / when                                                                                                                                                   | Then                                                                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BDD-M1-1 | A protected package has an approved integrity only in a comment, nearby block, duplicate key, peer snapshot, custom tarball or ambiguous resolution.           | The exact-pin gate parses the YAML 1.2 package node, requires one exact default-registry integrity-only resolution, and fails closed.                   |
| BDD-M1-2 | A protected manifest pin and the parsed effective package record exactly match the reviewed inventory.                                                         | The gate passes and `--write` updates only the reviewed version/integrity entry.                                                                        |
| BDD-M1-3 | A workflow expresses `uses`, triggers, jobs, permissions, checkout inputs, runner labels or environments with quoted keys, flow collections or multiline YAML. | Governance evaluates the parsed YAML graph with GitHub's YAML 1.2 semantics; unsupported aliases, duplicate keys and malformed shapes fail closed.      |
| BDD-M1-4 | CODEOWNERS names `/.github/workflows/*` without at least one owner token.                                                                                      | Governance rejects the entry; a valid path plus owner passes.                                                                                           |
| BDD-M1-5 | A protected Pulumi dependency is in exact-pin admission but missing from cooling-off, including `@pulumi/cloudflare`.                                          | Inventory-equality tests fail; both controls import one reviewed source of truth.                                                                       |
| BDD-M1-6 | The generator receives an absolute/traversing CLI output override or finds a symlinked output root, `docs` directory or target.                                | It writes nothing outside the approved real root and exits nonzero without following the link.                                                          |
| BDD-M1-7 | The approved output root and real `docs` directory are safe.                                                                                                   | Generation writes through a same-directory exclusive temporary file and atomic rename, returns the exact path/content, and leaves no temporary residue. |

### Step-by-step

1. Capture the four exact findings and baseline tests at merged main.
2. Resolve and inspect the exact `yaml@2.9.1` candidate with scripts disabled;
   run the pinned OSV gate and review the complete graph before installation.
3. Add red fixtures for lockfile comments/duplicates/tarballs, YAML quoted/flow
   keys and aliases, ownerless CODEOWNERS, protected-list drift and symlinks.
4. Parse pnpm lock and workflow YAML strictly, centralize the protected list,
   and implement contained no-follow generation with atomic replacement.
5. Run focused and full repository tests, OSV, Semgrep, secret scan, exact diff
   review, Codex Security validation and exact-head CI.
6. Merge only the signed+DCO exact green head, then re-scan merged main before
   starting the next finding batch.

### Forbidden shortcuts

- No regex or bounded-text-window decision over YAML security semantics.
- No permissive duplicate-key, alias, merge-key, custom-tarball or parser-error fallback.
- No dependency install, build, test or lifecycle execution before candidate OSV and provenance review pass.
- No blanket advisory exception, severity threshold, `MAL-*` waiver or fabricated audit.
- No path-prefix string check without real-path and symlink-component checks.
- No writing through an existing target symlink or unverified parent directory.
- No unrelated product-policy, component, release or version change in M1.

### Evidence log

| Evidence             | Expected                                                                            | Actual                                                                                                                                                | Status     |
| -------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Baseline             | Existing focused and full gates pass at `a759f3d79784b5050f4f2af4437529dc84576288`. | Existing tests passed alongside the changed head; the base was not separately rebuilt because no base failure was under investigation.                | recorded   |
| Candidate dependency | Exact scripts-disabled graph, provenance and OSV/MAL review pass before execution.  | Lock-only resolution added one package; OSV 2.7.0 scanned 575 packages with zero advisories/`MAL-*`; tarball SHA-512 matched the lock.                | pass       |
| Red tests            | Every reported bypass is reproduced before the fix.                                 | Initial focused run: 15 expected failures, 55 passes and 2 existing network-gated skips.                                                              | pass       |
| Focused tests        | All seven BDD rows pass through production scripts.                                 | Four focused files: 73 passes and 2 existing network-gated skips.                                                                                     | pass       |
| Regression/security  | Full workspace, Semgrep, secrets, OSV, Codex Security and exact-head CI pass.       | Build/tests/typecheck/lint/format pass; Semgrep 210 rules/9 files/0 findings; 1,356 added lines/0 high-confidence secret matches; remote gates pending. | local pass |

### Definition of done

- The four canonical source findings are absent from a successful exact-head
  Codex Security scan and no replacement finding covers the same attack path.
- Candidate dependency evidence satisfies the repository OSV admission rule.
- Every BDD and full repository gate passes from the signed+DCO commit that CI
  reviews and the maintainer merges.
