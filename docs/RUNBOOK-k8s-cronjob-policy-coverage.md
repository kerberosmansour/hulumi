# Runbook: Kubernetes CronJob policy coverage

Status: M1 confirmed by the user's standing instruction to continue autonomously with the SLO skills.
Finding: `csf_9f1c30c73922359067f18dd8` — CronJob nesting bypasses all Kubernetes workload controls.
Base: `a83461339211ba2271821265cc1a7400a0278e4d`.

## Problem

`HulumiK8sHardeningPack` lists `kubernetes:batch/v1:CronJob` as a protected workload, but its shared extractor reads `spec.template.spec`. Kubernetes CronJobs store their Pod template at `spec.jobTemplate.spec.template.spec`. As a result, WL-1 through WL-4 return clean for privileged containers, host namespaces, mutable images, and missing resource declarations inside CronJobs.

## Security boundary

The policy pack must derive the PodSpec from the concrete Kubernetes resource type. A caller-controlled resource shape must not redirect or suppress inspection. Unknown or malformed shapes remain out of scope for this bounded fix; the four existing rules continue to evaluate only the PodSpec fields they already own.

## M1 — close the CronJob nesting bypass

### Allowed files

- `docs/RUNBOOK-k8s-cronjob-policy-coverage.md`
- `docs/slo/critique/k8s-cronjob-policy-coverage-m1.md`
- `docs/slo/verify/k8s-cronjob-policy-coverage-m1.md`
- `docs/slo/lessons/k8s-cronjob-policy-coverage-m1.md`
- `docs/slo/completion/k8s-cronjob-policy-coverage-m1.md`
- `packages/policies/src/k8s/hulumi-hardening-pack.ts`
- `packages/policies/tests/k8s/hulumi-k8s-hardening-pack.test.ts`
- `docs/cookbooks/policy-pack-rollout.md`
- `docs/components/README.md`

### Acceptance

1. WL-1 rejects a privileged CronJob container and init container through `spec.jobTemplate.spec.template.spec`.
2. WL-2 rejects CronJob `hostNetwork`, `hostPID`, and `hostIPC` settings.
3. WL-3 rejects mutable CronJob application and init-container images.
4. WL-4 reports missing requests and limits for CronJob application and init containers.
5. Job and Deployment extraction remains unchanged, and a decoy `spec.template.spec` cannot override the real CronJob PodSpec.
6. Focused and full policy-package tests, build, typecheck, lint, format, license, OSV, Semgrep, secret scan, exact-head CI, and merged-main Codex Security validation pass.
7. Documentation states the exact CronJob path covered by all four workload rules.

### Dependency admission

No dependency or lockfile change is allowed. Existing admitted dependencies may be reused for verification. `scripts/osv-dependency-gate.py` still runs and must fail closed on scanner, network, or parsing errors.

### Out of scope

- New Kubernetes resource kinds or admission controllers.
- Changes to suppressions, enforcement levels, rule identifiers, or package versions.
- CodeQL queries, Semgrep rules, secret-scanning patterns, deployments, or cluster mutation.
- Publication; this fix is queued for the next coordinated release milestone.

### Evidence commands

```text
pnpm --filter @hulumi/policies test -- --run tests/k8s/hulumi-k8s-hardening-pack.test.ts
pnpm --filter @hulumi/policies test
pnpm --filter @hulumi/policies build
pnpm --filter @hulumi/policies typecheck
pnpm --filter @hulumi/policies lint
pnpm format:check
pnpm license:check
python3 scripts/osv-dependency-gate.py --output <report>
```
