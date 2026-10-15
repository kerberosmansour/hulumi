# SLO critique — OSV scanner cache integrity M1

Runbook: `docs/RUNBOOK-osv-scanner-cache-integrity.md`
Date: 2026-10-15
Threat-model mode: degraded. This bounded bootstrap correction has no frozen SCA-executable `.slo.json`; the abuse ID is defined in the runbook and no schema-stability claim is made.

## CEO pass

| id  | persona | category     | runbook section | finding                                                                                                                         | concrete scenario                                                                                     | recommendation                                                                 | resolution                                                     |
| --- | ------- | ------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| C1  | CEO     | reduce-scope | Out of scope    | The scan also reports stale output and remediation-path defects, but combining them obscures the executable substitution proof. | A broad SCA rewrite changes routing and remediation while repairing one pre-scan code-execution path. | Keep M1 to scanner selection, verification, tests, and operator documentation. | accepted under the standing autonomous maintenance instruction |

## Engineering-lead pass

| id  | persona          | category | runbook section | finding                                                                                       | concrete scenario                                                                                           | recommendation                                                                                         | resolution           |
| --- | ---------------- | -------- | --------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------- |
| E1  | engineering lead | ask      | Cache contract  | Verifying only newly downloaded bytes leaves the existing-file fast path vulnerable.          | A correct binary is cached, then replaced before the next scan.                                             | Route downloads, cache hits, and explicit overrides through one verifier immediately before return.    | accepted; BDD-M1-1/5 |
| E2  | engineering lead | auto-fix | Atomicity       | Writing directly to the final filename exposes partial downloads and concurrent-reader races. | Another scan observes a truncated but executable file while the first process is still writing.             | Use a unique private staging directory, verify staged bytes, rename, then verify the final file again. | applied to contract  |
| E3  | engineering lead | ask      | Compatibility   | Silently accepting any system scanner preserves convenience by weakening the pin.             | PATH contains an older or wrapper binary that reports a version successfully but is not the admitted asset. | Remove automatic PATH selection; retain only an absolute override whose bytes match the platform pin.  | accepted; documented |

## Security pass

| id  | persona  | category | runbook section   | finding                                                                                                  | concrete scenario                                                                                                            | recommendation                                                                                           | resolution               |
| --- | -------- | -------- | ----------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| S1  | security | ask      | Security contract | **Severity: high — CWE-353.** Repository-controlled existence is treated as executable integrity.        | A pull request commits or generates the predictable `.cache/osv-scanner/...` path and gains the CI scanner's credentials.    | Put executable trust outside the target and exact-hash every selected binary before spawn.               | accepted; primary repair |
| S2  | security | ask      | File-system proof | Digest verification alone still follows symbolic links and can read an attacker-selected target.         | The cache filename or a parent component links to a file outside the private cache.                                          | Use `lstat`, reject every symbolic-link component, require a regular bounded file, owner, and safe mode. | accepted                 |
| S3  | security | ask      | Failure behavior  | Deleting or replacing a corrupt cache automatically destroys incident evidence and may hide persistence. | A tampered binary is overwritten with the official asset and the scan succeeds without surfacing the attempted substitution. | Fail closed and leave suspect bytes untouched for investigation.                                         | accepted                 |
| S4  | security | auto-fix | Download bound    | `arrayBuffer()` currently permits an unbounded response allocation before the digest comparison.         | A compromised delivery endpoint sends a very large body and exhausts memory before failing the hash.                         | Reject an oversized content length and enforce a 64 MiB post-read cap before staging.                    | applied                  |

### Expanded finding S1

- **Severity: high; CWE-353 — Missing Support for Integrity Check.**
- **Evidence:** `ensureScannerBinary` returns a repository-local existing path before digest or link checks, and `runProcess` supplies the path directly to `spawn`.
- **Threat link:** `tm-hulumi-sca-repository-scanner-substitution`; eliminated when every returned executable is outside the target and matches the official platform digest. Compromise of the upstream official release/signing infrastructure remains outside this repository control.
- **Variant analysis:** wrong digest, file symlink, directory symlink, non-file, oversized file, foreign owner, unsafe mode, repository-contained cache, relative override, wrong-digest override, fake PATH scanner, and post-verification mutation.
- **Remediation proof:** focused bootstrap BDDs, package regressions, exact-head CI, and exact merged-main Codex Security rescan.

## Design pass

Skipped: no UI surface.

## Critique decision

M1 remains one bounded milestone. The user's standing instruction authorizes continued defensive execution. The allow-list is unchanged, the official v2.7.0 checksums were independently re-read from the Google release asset, and implementation may proceed BDD-first.
