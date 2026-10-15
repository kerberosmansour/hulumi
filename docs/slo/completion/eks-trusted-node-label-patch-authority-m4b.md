# Completion Summary — EKS trusted-node label patch authority M4b

Date: 2026-10-16
State: implementation and local verification complete; external ship gates pending
AgentBus task: `t2_mva67wo3_b67931fd-28d`

## Goal completed

- Possession of the projected controller ServiceAccount token alone no longer
  authorizes a Node PATCH.
- Reads use that projected token; each mutation uses a fresh bounded EKS IAM
  authenticator token backed only by the component's exact Pod Identity path.
- One STANDARD AccessEntry, independent RBAC roles and fail-closed admission bind
  mutation to the exact IAM role, group, username prefix and M4a patch shape.

## Files changed

- The SLO runbook, critique, verification, lessons and completion records.
- The canonical threat model, component guide and reconciler runbook.
- `packages/k8s-baseline/package.json`, `pnpm-lock.yaml` and the protected exact-
  dependency registry for two already-resolved direct imports.
- The EKS IAM authenticator module, Kubernetes adapter, controller entry point
  and Pulumi reconciler.
- Focused signer, adapter/TLS and component render tests.

## Tests added

- `trusted-node-label-controller-eks-auth.test.ts` covers the independent SigV4
  vector, exact credential endpoint/token-file options, ambient fallback denial
  and stable redaction.
- Existing reconciler and runtime-boundary tests now cover the AccessEntry,
  split RBAC/admission identities, malformed IAM tokens and distinct TLS
  Authorization headers.

## Runtime validations added

- The local TLS critical journey observes file-backed ServiceAccount tokens on
  GET and a distinct fresh IAM token on PATCH while preserving the exact
  adapter-to-AWS-to-kernel-to-patch path.

## Compatibility checks performed

- Public component inputs, outputs and resource token are unchanged.
- Node.js/CommonJS and Pulumi peer ranges are unchanged.
- Focused tests pass 19/19; the full package passes 292 tests across 22 files.
- The workspace passes tests, type checking, builds, lint, license boundary,
  exact pin, workflow governance and formatting checks.
- OSV 2.7.0 reports zero known vulnerabilities and zero malicious-package
  advisories across 575 resolved packages. Semgrep production and secret scans
  report zero findings/errors.

## Documentation updated

- The component guide states AccessEntry authentication and Pod Identity Agent
  prerequisites, exact authority, coordinated rollout/rollback and residuals.
- The threat model updates abuse case 6 from reusable ServiceAccount mutation to
  the IAM identity split and records the same-ServiceAccount Pod residual.
- The canonical runbook records M4a/M4b as pre-M3 security corrections.

## .gitignore changes

- None. Raw scanner reports and red-test logs remain outside the repository in
  the task evidence directory.

## Test artifact cleanup verified

- No generated build output or raw evidence file is staged. Final scope checks
  are limited to the 18-file milestone allow list.

## Deferred follow-ups

- M3 owns a matching digest-pinned controller image, registry provenance/image
  scanning, isolated EKS qualification, AccessEntry propagation, rolling
  replacement, scale from zero and CloudWatch/audit evidence.
- The signed PR head must pass all required GitHub checks, merge without content
  drift, and receive a fully read xhigh Codex Security scan on merged main.

## Known non-blocking limitations

- A cluster-authorized actor able to admit a Pod under the exact controller
  ServiceAccount can receive the same Pod Identity credentials. Namespace
  workload admission and governance must prevent that before live use.
- AccessEntry propagation can temporarily deny early PATCH calls. The controller
  fails closed and retries only after a later full re-attestation with a fresh
  token.
- M4b makes no live EKS, registry artifact, official image or publication claim.
