# Hulumi SCA operator notes

The SCA CLI pins the official Google OSV-Scanner v2.7.0 release and verifies the exact platform asset SHA-256 before every execution. It does not discover `osv-scanner` through `PATH` and it never selects executable content from the repository being scanned.

By default, the verified binary is stored in the operator cache at `~/.cache/hulumi/osv-scanner/v2.7.0`. Set `HULUMI_SCA_CACHE_DIR` only to an absolute directory outside the scanned repository. The CLI creates the cache and version directory with private permissions, rejects symbolic-link components, and requires the executable to be a regular, bounded, current-user-owned, non-group/world-writable file. Existing cache entries are rehashed on every use. A corrupt entry is preserved for investigation and the scan fails closed instead of replacing it.

`OSV_SCANNER_BIN` is an optional operator override. It must be an absolute path outside the scanned repository and its bytes must match the pinned v2.7.0 asset for the current operating system and architecture. Relative, repository-local, linked, differently owned, unsafe-mode, oversized, or wrong-digest overrides are rejected.

Downloads are accepted only from the pinned HTTPS GitHub release path and its GitHub asset host, capped at 64 MiB while streaming, verified before private staging, installed atomically, and verified again at the final path.

Dependency admission remains separate from scanner bootstrap. Resolve candidate lockfiles with lifecycle scripts disabled, run `python3 scripts/osv-dependency-gate.py`, and review package provenance and the complete graph diff before installation, build, test, merge, or publication. OSV detects known vulnerability and malicious-package advisories; it cannot prove the absence of unknown malware.

## Bounded emergency remediation

`sca remediate-emergency` treats the work-item JSON as untrusted evidence. Read-only planning keeps
the existing defaults. Applying a file change requires three explicit bindings:

```sh
WORK_ITEMS=.cache/sca-work-items.json
WORK_ITEMS_SHA256=$(shasum -a 256 "$WORK_ITEMS" | awk '{print $1}')
EXPECTED_REVISION=$(git rev-parse HEAD)

npm run sca:remediate -- \
  --apply true \
  --repository-root "$PWD" \
  --expected-revision "$EXPECTED_REVISION" \
  --work-items-sha256 "$WORK_ITEMS_SHA256"
```

Review the complete work-item file before computing its digest. Apply fails unless the supplied
repository root is canonical, `HEAD` is the exact 40-character revision, the work-item bytes match
the supplied SHA-256, and every direct or derived target is a tracked, unchanged, regular file under
that root. Absolute paths, traversal, backslashes, symbolic links, special files, stale revisions,
digest mismatches, and concurrent target replacement are rejected before overwrite.

Supported file mutations use no-follow reads and checked same-directory atomic replacement. The
bounded apply path does not run package managers. In particular, pnpm workspaces must use the
separate dependency-admission flow: resolve with lifecycle scripts disabled, scan the full candidate
graph with the pinned OSV gate, review provenance and the graph diff, and only then proceed through
the repository's reviewed update workflow.
