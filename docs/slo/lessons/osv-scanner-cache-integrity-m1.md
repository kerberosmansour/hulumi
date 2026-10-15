# Lessons — OSV scanner cache integrity M1

Date: 2026-10-15

1. Executable caching is part of the trust boundary. Repository-relative placement turned a dependency scanner into an arbitrary-code path before the scan started.
2. Download-time hashing is insufficient. Cache hits and explicit overrides need the same verification immediately before use, and mutation after one successful check must fail the next check.
3. Link checks must precede writes. Rejecting a parent link only after recursive directory creation can still modify the link target even if execution later fails.
4. A pinned version string does not pin a binary found on PATH. Exact platform digests provide the identity contract; convenience discovery must not bypass it.
5. Preserve corrupt cache evidence. Failing closed without deletion or replacement makes tampering visible and prevents a clean download from hiding the event.
6. Happy-path verification matters for security bootstrap changes. The actual official asset proved that redirect-host restrictions, streaming bounds, platform naming, digest pins, staging, permissions, and cache-hit verification work together.
7. An unchanged admitted graph can be restored safely when the operation is frozen, offline, and lifecycle-script-disabled. Recording zero downloads makes that recovery auditable.
