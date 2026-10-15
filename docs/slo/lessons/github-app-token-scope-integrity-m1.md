# Lessons — GitHub App token scope integrity M1

Date: 2026-10-15

1. A configuration validated by an IaC component is not enforced unless every runtime helper is bound to the same value. The IaC-owned digest tag makes that relationship explicit and independently checkable.
2. An API omission can be an authority expansion. GitHub gives omitted `repositories` or `permissions` the installation or App defaults, so both fields belong in every successful request.
3. A wildcard allowlist should change target eligibility without changing token breadth. Selecting one repository and sending its name keeps each token narrowly scoped.
4. Canonicalization is a protocol. TypeScript and `jq` need the same property order, ASCII-safe input alphabet, sorted repositories, sorted permission keys, compact encoding, and byte limits.
5. Failure order matters. Scope and target checks before PEM materialization and signing turn negative tests into evidence that rejected requests do not touch key material.
6. Secret-safe shell code must consider process arguments as well as logs. `jq --rawfile` avoids copying the PEM into an argv value during payload construction.
7. Security migrations sometimes need a deliberate compatibility break. Preserving the three-argument population default would preserve wildcard repositories and empty permissions.
8. Workspace build scripts that delete output directories must not run concurrently with tests that resolve those outputs. Run broad build and test gates sequentially even when package-local checks can run in parallel.
