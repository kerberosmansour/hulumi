# Verification: Kubernetes CronJob policy coverage M1

## Result

Local verification passes. Exact-head CI and merged-main Codex Security validation remain required before closeout.

| Gate | Result | Evidence |
| --- | --- | --- |
| Baseline | pass | The focused file passed 20/20 tests before adding the regression cases. |
| RED | pass | Seven CronJob assertions failed while the existing 20 tests stayed green: two WL-1 cases, three WL-2 host namespace axes, WL-3, and WL-4. |
| Focused BDD | pass | `hulumi-k8s-hardening-pack.test.ts`: 27/27. The fixture includes a safe decoy at `spec.template.spec`; all findings come from the authoritative CronJob path. |
| Policy package | pass | 18 files, 336/336 tests. |
| Build/typecheck/lint | pass | `@hulumi/policies` build, typecheck, and ESLint all passed. |
| Formatting/licensing | pass | Repository Prettier check and IDs-only license-boundary lint passed. |
| OSV | pass | OSV-Scanner 2.7.0 scanned 2 lockfiles and 575 package occurrences: 0 vulnerable occurrences and 0 `MAL-*` advisories. Report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Semgrep | pass | Semgrep OSS 1.156.0 ran 210 applicable community rules over the changed TypeScript source and test: 0 findings and 0 errors. JSON SHA-256 `c213bbcb4b38b3c602aeef34a3faf21a3c6406dcdd3abf1cdee9cd47bd9603d6`. |
| Secret diff scan | pass | High-confidence AWS access key, GitHub token, Slack token, and private-key patterns: 0. |
| Dependency graph | pass | No manifest or lockfile changes. Existing admitted dependencies were reused with lifecycle installation disabled. |
| Scope | pass | Only the nine-file M1 allow-list is modified. |

## Behaviour checked

- CronJob application and init containers are inspected for privilege, mutable images, and missing resources.
- `hostNetwork`, `hostPID`, and `hostIPC` are inspected under the nested CronJob PodSpec.
- A sibling `spec.template.spec` decoy cannot redirect inspection.
- Existing Pod and ordinary controller tests remain green.

## Operational limit

This milestone validates Pulumi resource inputs during policy evaluation. It does not inspect live Kubernetes objects or prove admission-time mutation after deployment.
