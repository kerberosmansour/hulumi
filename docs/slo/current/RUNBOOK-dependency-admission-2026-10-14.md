# Dependency admission — SLO maintenance contract

Scope authorized 2026-10-14: make OSV mandatory for new/updated dependencies, CI and daily workflows, and standing Codex/Claude instructions. Preserve existing dependency audits; never bypass known malicious-package reports.

M1: a standard-library bootstrap for checksum-pinned official OSV 2.7.0, exact lockfile inventory, JSON and diagnostic evidence, fail-closed scan outcomes. Read-only reusable job precedes repository dependency execution; one scan shared by each build matrix. Daily SCA delegates directly, removing duplicate JS scanner installation/triage.
M2: validate negative boundaries, live inventory, workflow permissions/order and documentation; open and merge verified PRs. Rust additionally repairs four same-day rustls advisories with an exact reviewed delta.

| Contract | Constraint |
|---|---|
| Allow-list | scripts/osv-dependency-gate.py, scripts/test_osv_dependency_gate.py, scripts/check-maintenance-workflows.py, scripts/generate-release-sboms.py, scripts/test_generate_release_sboms.py, tests/skill-bdd/sca-track-a-contract.test.ts, packages/k8s-baseline/tests/release-readiness.test.ts; .github/workflows/osv-dependency-gate.yml; existing dependency-executing workflows; .gitignore; AGENTS.md; CLAUDE.md; README.md; this contract. Rust additionally Cargo.lock, supply-chain/audits.toml, CHANGELOG.md for the exact rustls repair. |
| Read-list | All changed workflows and root manifests/locks, existing scope and exception files, official OSV release metadata/SHA256SUMS/source documentation, existing workflow regressions. |
| Dependencies | No new project dependency; official scanner is a verified build tool. OSV version and six platform digests matched to official release metadata and published SHA256SUMS. |
| Compatibility | Existing test/check names retained. Read-only scans do not remediate, merge, execute install scripts or perform call analysis. Deliberate vulnerable fixture locks stay excluded and uninstalled. |
| Data classification | Internal: dependency inventory; no source code or credentials in scan requests. |
| Controls | OWASP C2 secure libraries: resolved direct/transitive graph admission; C5 validation: checksum/inventory/expiry boundaries; SSDF PW.4 identifier only. |
| Bounds/invariants | Binary <=64 MiB; HTTPS download timeout 60s; scan subprocess timeout 600s; CI 15min; mandatory nonempty complete inventory; zero write/OIDC credentials. |
| Abuse scenarios | Changed cached binary, symlink executable/lock, malicious waiver, partial/empty scan, findings paired with erroneous zero exit, scanner/network error cannot admit dependencies. |
| Exemplar/anti-exemplar | Reuse existing exact dependency trust guards; avoid npm bootstrap before scanning, floating installers, blanket ignores and autonomous privileged remediation. |
| Rollback | Gate removal restores unscanned admission and is unsuitable as a routine recovery; repair pinned scanner/network failures without weakening policy. |
| Refactor/AI | Direct workflow factoring only; no AI component. |
| Validation | Live scans; fifteen negative/ordering tests in each repo; existing workflow authority tests; YAML/governance/formatter checks; unchanged product tests where appropriate; Rust audit/deny/vet/all-feature tests. |
| Definition of done | Real scans complete; negative cases fail correctly; production jobs depend on scanner; reports survive failures; instructions/docs reflect known-malware limits; PR checks pass before merge. |

Initial evidence: Hulumi 630 resolved packages across two locks; Rust 514 across Cargo.lock. Both live OSV scans pass; Rust retains three explicit vulnerability dispositions enforced by the existing exact-version/expiry guard. All fifteen admission tests and existing maintenance-authority tests pass. Cargo.lock changes only rustls version/checksum; audited graph retained. Final CI evidence is recorded at PR closeout.

Release SBOM generation no longer resolves/executes the vulnerable cdxgen graph.
A standard-library writer consumes the already-admitted OSV inventory and a
receipt binding report and workspace-lock hashes, checks actual package tarball
identity, and emits CycloneDX 1.6. Scope is an explicit workspace superset with no
inferred runtime-only membership or dependency relationships. Six inventories
from the real released 3.0.0 archives pass the official CycloneDX 1.6 schema;
changed reports/locks and failed admission are rejected. No SBOM tool dependency
was added.

The publisher uses npm bundled with the trusted Node runtime, verifies >=11.5.1,
and performs no global npm package installation with OIDC authority. Existing
release-readiness tests now enforce this boundary and the inventory-based SBOM
path. The full workspace suite and targeted SCA contract tests pass.
