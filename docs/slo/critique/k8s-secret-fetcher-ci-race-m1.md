# Critique — Kubernetes Secrets Manager fetcher CI race M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-k8s-secret-fetcher-ci-race.md`
Verdict: approved for bounded execution after the revisions captured below.

## CEO pass

- CI that succeeds or fails based on a developer's AWS profile is not release evidence. The repair removes a release bottleneck and protects trust in the existing gates.
- A separate seven-file milestone keeps the Cloudflare feature diff reviewable and avoids hiding pipeline work inside a security feature PR.
- Revision accepted: merge the repair first, then rebase and re-run the blocked feature PR rather than administratively bypassing its failed check.

## Engineering lead pass

- A mutable module-level hook is safe only as an instance factory input. Reading it inside a future callback lets teardown or another test change the behavior of an already-created component.
- Capturing the selected function before `Output.apply` is the smallest production-safe repair. It changes neither the public API nor the SDK implementation.
- Revision accepted: the regression resets the hook immediately after construction, removing scheduler speed from the assertion, and the 64-key control must await settlement with its own complete payload.

## Security pass

- Falling through to the AWS SDK violates the suite's mock-only boundary and can consume ambient region or credential configuration. A fake CI region would conceal the authority leak and might progress to credential discovery.
- The existing unhandled-rejection listener may suppress only the intentional `FailClosedError`; the repair must not broaden it or ignore generic errors.
- Revision accepted: prove the injected function is called exactly once, prove its value reaches the mock Secret, and review the final logs for credential and token shapes.

## Design pass

- The fetcher belongs to the component instance conceptually even though the test seam is module-scoped. The implementation should name the captured value clearly and explain why selection is synchronous.
- The test should describe the lifecycle guarantee rather than CI timing so it remains useful outside GitHub Actions.
- Revision accepted: keep all operator-visible semantics and documentation unchanged because this is an internal scheduling correction.

## Final constraints

- Bind fetch authority once per component before asynchronous work.
- No environment, workflow, dependency, API, version, or publication change.
- Preserve all fail-closed defaults, redaction, bounds, and logging.
- Require deterministic RED/GREEN evidence, exact allow-list evidence, exact-head CI, and a pinned merge.
