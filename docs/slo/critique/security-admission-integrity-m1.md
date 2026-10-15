# Adversarial critique — security admission integrity M1

Date: 2026-10-15. Review order: CEO, engineering lead, security officer,
design. The operator's standing authorization confirms this bounded defensive
milestone and its candidate dependency process.

| id | persona | category | finding | scenario | resolution |
| --- | --- | --- | --- | --- | --- |
| M1-C1 | CEO | scope | Four findings affect the controls used to admit every later security fix; mixing product-policy findings would delay restoration of that trust boundary. | A later remediation passes a gate whose parser is itself bypassable. | Fix only lock/workflow/cooling-off/path admission in this milestone. Applied. |
| M1-C2 | engineering lead | dependency | A handwritten YAML parser would create another ambiguous security parser. | Flow maps, quoted keys or merge syntax diverge from GitHub/pnpm semantics. | Admit one mature, zero-runtime-dependency YAML 1.2 parser under the repository OSV rule before execution. Applied as a gate, not yet admitted. |
| M1-C3 | engineering lead | compatibility | Workflow governance also performs GitHub environment lookups and runner checks; a wholesale rewrite could silently drop those controls. | Quoted-key tests pass but privileged environment checks stop running. | Preserve rule IDs and public collection APIs, parse once, and regression-test every existing rule plus adversarial fixtures. Applied. |
| M1-C4 | security | fail-closed | YAML parsers commonly accept duplicate keys, aliases and merge keys unless configured. | An attacker places safe and unsafe values under the same key or expands an alias after review. | Reject document warnings/errors, duplicates, aliases, merge keys, non-map roots and unsupported node shapes. Applied to the contract. |
| M1-C5 | security | provenance | Adding a parser to repair supply-chain admission can worsen the same boundary. | An unreviewed transitive or install script executes before scanning. | Resolve lock-only with scripts disabled; verify official registry integrity, publisher/source, scripts and zero runtime dependencies; run pinned OSV before install/test. Applied as a hard order constraint. |
| M1-C6 | security | filesystem | Real-path checks alone have a check/write race and final symlinks can redirect ordinary writes. | A pre-positioned `docs` link points outside the requested root. | Reject symlink components, create an exclusive same-directory temporary, and atomically rename over the exact final entry; add no-write fixtures. Applied. |
| M1-C7 | design | not-applicable | The milestone has no UI. | N/A. | Keep diagnostics concise and actionable; no design review required. |

## Verdict

Proceed after the exact candidate lockfile, graph, provenance and OSV report are
clean. The milestone is local and defensive. No product capability, cloud
mutation, release, advisory exception or dependency execution is authorized by
this critique.
