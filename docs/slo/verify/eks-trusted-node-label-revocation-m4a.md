# Verification: EKS trusted-node label revocation M4a

Date: 2026-10-16
Base revision: `9680af864a0b1dd375a1477480914a17ce017103`
AgentBus task: `t2_mva4kixq_f0241a8b-ab6`
Local decision: pass; exact-head CI and merged-main Codex Security remain ship gates.

## BDD and runtime evidence

- Red evidence was captured before the production implementation: `bdd-red.log`, SHA-256 `3fcfe8dcc9bdbed70b11ab19b50bd1b32cc95847a2e341cf4b6b69b84020bed8`. The revocation scenarios failed because the kernel still returned deny/no mutation and the adapter/controller lacked remove behavior.
- The final focused suite passed 48 tests across the reconciliation kernel, controller, component admission policy and runtime adapter.
- The final `@hulumi/k8s-baseline` suite passed 21 files and 287 tests.
- Final package typecheck, build and ESLint passed. Pre-final workspace build, typecheck, test and lint gates also passed; the final runtime-guard edit is covered by the focused/full package tests and package typecheck.
- Prettier check passed for all eight changed source/test files and `git diff --check` found no whitespace errors.

The regression matrix proves exact-value revocation for malformed provider identity, stale evidence, node-group mismatch, missing Auto Scaling membership, stopped EC2, zone mismatch and missing taint. It also proves conflicting values are preserved, malformed local identity cannot authorize removal, current-state drift invalidates a plan, selector loss does not hide a trusted Node, the union has one global bound, and the adapter rejects any non-exact remove patch.

## Security and dependency evidence

- The repository OSV gate used official OSV-Scanner v2.7.0 over both lockfiles: 575 packages, zero known vulnerabilities and zero `MAL-*` advisories. Raw report SHA-256: `b87e3bcfca95882531d039010d22f94d20b71e6b40345036cb310b32b4bbf2be`.
- The implementation adds no package, manifest or lockfile change. `lint:exact-pin-guard` passed for all 14 protected dependencies and `lint:workflow-governance` passed.
- Semgrep 1.156.0 ran 74 TypeScript/Node rules over the four changed production files: zero findings and zero scan errors. JSON SHA-256: `f63dfa9c18e89003d1f3997fac8beedec1e408c745bee59e9005ee8b38a23501`.
- The Semgrep community secrets rules ran 41 applicable rules over all eight changed source/test files: zero findings and zero scan errors. JSON SHA-256: `faf764301a092d067a8dbbfd66a9f03d99d2b56204db293d2e088ef9d6876c36`.
- No cloud, GitHub, package-registry or live Kubernetes mutation was performed during local verification.

## Contract assessment

All nine BDD rows in the runbook pass locally. The controller removes only the exact configured value, binds the JSON Patch to Node identity and current state, re-reads before mutation, and records stable hashed audit evidence. Capacity counts only current node-group members. The known reusable ServiceAccount identity boundary remains explicitly out of scope for M4b.

Shared provider-discovery loss remains a bounded residual: without a trustworthy candidate/evidence set, the controller reports a provider failure and makes no mutation. Revocation occurs on the next cycle that can identify and evaluate candidates. The implementation and documentation make no stronger claim.

## Remaining ship gates

1. A signed DCO commit contains exactly the 13 allowed files.
2. Every required GitHub check passes at the exact PR head.
3. The exact head is merged without widening scope.
4. Codex Security scans the resulting main revision at xhigh effort and no longer reports the stale trusted-node-label finding.
