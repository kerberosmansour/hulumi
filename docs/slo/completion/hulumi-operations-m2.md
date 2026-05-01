# Completion Summary — hulumi-operations Milestone 2 (combined M8)

## Goal completed

`DetectiveServicesEnable` exists. Default-on Access Analyzer + Inspector v2 + Cost Anomaly Detection. Primary EventBridge route to consumer SNS. Optional KEV dual-routing topic for CISA-Known-Exploited-Vulnerabilities findings.

## Files changed

### Added (source)
- `packages/baseline/src/aws/detective-services-enable.{args,outputs,ts}.ts`.

### Added (tests)
- `packages/baseline/tests/detective-services-enable.test.ts` — 7 BDD scenarios.

### Added (docs)
- `docs/components/detective-services-enable.md`.
- `docs/slo/lessons/hulumi-operations-m2.md`, `docs/slo/completion/hulumi-operations-m2.md`.

### Modified
- `packages/baseline/src/aws/index.ts` — re-exports.

## Tests added

7 BDD scenarios:

- Default (all three services + primary EventRule).
- KEV dual routing emits a second rule + target.
- Additional event patterns each emit their own rule.
- Opt-out flags skip the matching service.
- Missing `findingsRoutingSnsArn` rejected.
- Invalid (non-JSON) `additionalEventPatterns` entry rejected.
- 17-pattern bound rejected.

## Static analysis evidence

| Check                  | Result |
| ---------------------- | ------ |
| `pnpm -r typecheck`    | green |
| `pnpm -r build`        | green |
| `pnpm -r lint`         | green |
| Full tests             | **81** baseline (was 74; +7) / 96 policies / 58 drift / 149 k8s-baseline / 28 skill-bdd / 4 example smoke |

## Compatibility

- All existing baseline components unchanged.

## Invariants

- `findingsRoutingSnsArn` required.
- `additionalEventPatterns` valid JSON; ≤ 16.

## Bounds

- `MAX_DETECTIVE_EVENT_PATTERNS = 16`.

## Documentation updated

- `docs/components/detective-services-enable.md` (new).

## Deferred follow-ups

- Real-AWS sandbox integration test under `tests/integration/aws-ops/`.
- Threat-model scenario (lands in M11).
