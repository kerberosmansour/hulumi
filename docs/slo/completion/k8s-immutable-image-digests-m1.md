# Completion — Kubernetes immutable image digests M1

Date: 2026-10-15
Status: implementation verified locally; exact-head and merged-main gates pending.

## Delivered

- A canonical, anchored SHA-256 image-reference grammar requiring one `@sha256:` suffix with exactly 64 lowercase hexadecimal digits.
- Fail-closed handling for every tag-only, no-tag, missing, uninspectable, malformed, alternate-algorithm, whitespace-bearing, multi-separator, or suffix-garbage input.
- Identical enforcement for application and init containers across all already-supported pod-owning resources.
- Preserved public rule ID `HULUMI-K8S-WL-3` and exported symbol `k8sWl3NoLatestImage`.
- Diagnostics that identify the container and remediation without copying the image reference.
- A corrected hardened-stack runtime fixture and operator documentation that no longer calls semantic-version tags immutable.

## Evidence summary

- Baseline 27/27; RED 15 intended failures with 27 controls; final focused 42/42.
- Runtime policy pack 2/2 and policy package 474/474 plus build, typecheck, and lint.
- All 19 runnable workspace projects passed build, typecheck, sequential tests, and lint.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero vulnerability or `MAL-*` results; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`.
- Semgrep 1.156.0: 210 rules, two TypeScript targets, zero findings/errors; report SHA-256 `c07fede0bb1423884f7d9f793cf37c00541471f793c9caa126c46a949f9df47a`.
- No manifest, lockfile, dependency, version, publication, registry access, image execution, or live Kubernetes change.

## Closeout boundary

The milestone is complete only after a signed DCO commit passes exact-head CI, merges without content drift, and an exact merged-main xhigh Codex Security scan confirms that tag-only and malformed image references cannot pass `HULUMI-K8S-WL-3`.
