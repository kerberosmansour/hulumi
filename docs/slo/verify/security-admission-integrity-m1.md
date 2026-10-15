# Verification Report — security admission integrity M1

## Outcome

Local verification passed. Four source-validated admission findings now fail
closed through production code: exact dependency integrity is read from the
single structural pnpm package node; workflow policy evaluates strict YAML 1.2
objects and real CODEOWNERS owners; Cloudflare shares the complete protected
Pulumi cooling-off inventory; and threat-model writes reject pre-positioned
symlink/path escapes before exclusive temporary-file plus atomic replacement.

Exact-head GitHub CI and Codex Security validation remain merge gates.

## Dependency admission

| Check | Result | Evidence |
| --- | --- | --- |
| Candidate resolution | pass | `yaml@2.9.1` was resolved in an isolated lock-only tree with lifecycle scripts disabled and no `node_modules`. |
| Graph diff | pass | One package identity added: `yaml@2.9.1`; no identity removed. Vite/Vitest snapshot keys now bind their existing optional YAML peer to the same package. |
| Registry provenance | pass | npm tarball source is `github:eemeli/yaml`, ISC, Node >=14.6, 233 safe tar members, zero runtime/optional dependencies, and no pre/install/postinstall hook. |
| Integrity | pass | Downloaded tarball SHA-512 exactly matched `sha512-3NxN8+78OdzbT7C/WjGsyfPAtJaN3FNDsWxv7Y7mcDsT/oOmgW8BpyQQFFBnvZE3j9Y2Sdz1ULFLezL7Eb2yFw==`. |
| OSV/MAL | pass | Official pinned OSV-Scanner 2.7.0 scanned 2 lockfiles / 575 package occurrences with zero vulnerabilities and zero `MAL-*`. Report SHA-256 `7b58f98d71e55c6d2d74d68e93d808c6cadc14e3a45bfa380f5e6e9f863dc851`; receipt SHA-256 `1929bfffaaa258e739e36c66bfe761cdd14087d0896fc7c4926eded6d9679e98`. |

## BDD and security evidence

| Scenario | Result | Evidence |
| --- | --- | --- |
| BDD-M1-1 / exact lock node | pass | Comment decoy, duplicate key, snapshot-only record, custom tarball and invalid integrity fixtures all fail. |
| BDD-M1-2 / reviewed match | pass | Current 14-entry manifest/lock inventory passes; `--write` targets the central inventory only. |
| BDD-M1-3 / workflow structure | pass | Quoted keys are governed; duplicate keys, aliases and merge keys emit `WF_YAML_1_STRICT_STRUCTURAL_PARSE`. Existing SHA, permission, checkout, environment and runner regressions pass. |
| BDD-M1-4 / CODEOWNERS | pass | An ownerless workflow pattern fails; a recognized user/team/email owner passes. |
| BDD-M1-5 / cooling-off inventory | pass | `@pulumi/cloudflare` is imported from the same protected inventory and extracted from the structural package map. |
| BDD-M1-6 / path escape | pass | Absolute/traversing CLI output and symlinked root, `docs` parent and target all fail without modifying the linked target. |
| BDD-M1-7 / atomic success | pass | Normal generation returns exact content/path and leaves no temporary file. |
| Focused Vitest | pass | 4 files, 73 tests passed; 2 pre-existing live-registry tests skipped unless `HULUMI_NETWORK_TESTS=1`. |
| Full workspace tests | pass | `pnpm -r --stream test` completed successfully after the required build. |
| Build/typecheck/lint/format | pass | Full workspace build, typecheck and lint passed; repository format and license-boundary checks passed. |
| Cold CI parser bootstrap | pass | A clean detached checkout completed `pnpm --filter hulumi install --frozen-lockfile --ignore-scripts` only after OSV admission, then the structural cooling-off check passed against the base lock. |
| Semgrep | pass | Semgrep OSS 1.156.0 ran 210 applicable rules over 9 changed source/test files with zero findings. JSON SHA-256 `e8dba08a131b94a4d3cd6495ec35b15e4ebe57b1f76117c8e83a1d33115afe9f`. |
| Secret-pattern scan | pass | The full pull-request diff contained no AWS access key, GitHub token, Slack token or private-key header pattern. |
| DAST | N/A | These are offline repository controls and a local file generator; no HTTP service or route is introduced. |

## Environment

- macOS 26.5.2 (25F84), arm64.
- Node.js 24.14.0; pnpm 9.12.0; Vitest 4.1.11; TypeScript 5.9.3.
- OSV-Scanner 2.7.0; Semgrep OSS 1.156.0.
- Installation used `pnpm install --frozen-lockfile --ignore-scripts` only
  after the isolated candidate admission passed.

## Limits

- OSV and provenance review address known advisories and expected package
  authority; they do not prove the absence of unknown malicious behavior.
- The file-write defense covers pre-positioned path/symlink attacks and atomic
  replacement. It does not claim isolation from a privileged process that can
  concurrently replace ancestor directories.
- GitHub CI and an exact-head Codex Security review are still required before
  merge.
