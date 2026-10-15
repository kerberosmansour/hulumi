# EKS trusted node-label qualification

This runbook operates the defensive live gate for
`EksTrustedNodeLabelReconciler`. It is limited to the isolated sandbox account
and an exact controller digest already published by merged `main`.

## Before dispatch

1. Confirm `trusted-node-label-image` completed on the exact merged commit.
2. Download its publication evidence and use the complete
   `ghcr.io/kerberosmansour/hulumi-trusted-node-label-reconciler@sha256:...`
   value from `published-image.txt`.
3. Confirm the `aws-weekly-integration` environment still requires review and
   the OIDC trust is scoped to `repo:kerberosmansour/hulumi:ref:refs/heads/main`.
4. Substitute the sandbox account ID in
   `weekly-integration-iam-policy.json`, apply its EKS qualification statements
   to the sandbox role, and leave production/shared account trust absent.
5. Keep the private versioned S3 backend URL in `PULUMI_BACKEND_URL`; the
   qualification refuses Pulumi Cloud, local state and another account's bucket.

Dispatch `eks-trusted-node-label-qualification` from `main` with the exact image
value. The readiness job performs anonymous image pull, OIDC identity and bucket
ownership checks, read-only API probes and `iam:SimulatePrincipalPolicy` for the
complete action set. Do not add policy during a run to make a partial fixture
continue; update and review the role, then start a new run.

## Required evidence

A release claim needs all four jobs green:

- dependency admission;
- read-only readiness;
- live provision and recovery qualification; and
- independent cleanup plus empty inventory verification.

The uploaded report contains only the image digest, run-scoped stack name,
bounded recovery durations and passed check names. It deliberately omits account
IDs, role ARNs, state URLs, kubeconfigs, provider responses, Node/provider IDs,
tokens and raw logs. GitHub job logs must not be treated as a substitute for the
cleanup verification job.

If provisioning fails after state creation, use the failed run's cleanup job
first. A new workflow run receives a different run-scoped name. If GitHub
cancellation prevented cleanup from starting, select the exact
`hulumi-nlr-<run-id>-<attempt>` stack with the private backend and run the same
test in `HULUMI_TEARDOWN_ONLY=1` mode. Never sweep by a loose `hulumi-nlr-`
prefix.
