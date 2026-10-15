# Lessons — Kubernetes Secrets Manager fetcher CI race M1

Date: 2026-10-15

## What happened

The test hook looked isolated because every test restored it. The component actually read that mutable hook later, inside `Output.apply`. Teardown could therefore change the authority of an instance that had already been constructed. Developer machines usually supplied an AWS region, while clean runners exposed the fallthrough as late unhandled rejections.

## What worked

- Turning the CI timing failure into an immediate hook-reset regression made the race deterministic.
- Capturing a function reference per component instance fixed the authority boundary without adding state, timers, environment variables, or public API.
- Disabling AWS configuration and metadata during package and workspace tests proved that success no longer depends on ambient cloud configuration.
- Keeping the pipeline repair in a separate SLO task preserved the Cloudflare PR's exact security allow-list and review scope.

## Reusable rule

Mutable test seams must be sampled synchronously at object construction or invocation boundaries. Asynchronous callbacks must use the sampled value, never re-read a global hook that teardown or another test can mutate. Constructor-only tests for objects that schedule work must either settle that work or inject a bounded local dependency so the test cannot outlive its assertions.

## Follow-up

Rebase PR #338 after this repair merges and require the previously failing workspace and release dry-run jobs to pass at the new exact head. Apply the same review heuristic to other module-level provider hooks during future issue work.
