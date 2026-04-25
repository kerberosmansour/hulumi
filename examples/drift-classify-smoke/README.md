# examples/drift-classify-smoke

Minimal `DriftClassifier` runner exercising both drift sources under
mocks (no AWS, no git CLI). Real-AWS integration runs weekly via
[`.github/workflows/weekly-integration.yml`](../../.github/workflows/weekly-integration.yml).

## Layout

- `index.ts` — wires the four adapters with stubbed inputs and runs
  `classify()` twice. Exported `runSmoke()` returns both verdicts.
- `tests/smoke.test.ts` — Vitest assertion that the verdicts come back
  as `ConsoleBreakGlass/high` + `ProviderApiChurn/medium`.

## Running

```sh
pnpm --filter @hulumi/drift build
pnpm --filter @hulumi-examples/drift-classify-smoke test
```
