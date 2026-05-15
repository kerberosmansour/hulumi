# Edge Platform Smoke Example

This example composes the Cloudflare, platform-pattern, and policy packages
from their package entrypoints. It is a mock-preview smoke test, not proof of
real provider behavior.

```bash
pnpm -r build
pnpm --filter @hulumi/example-edge-platform-smoke test
```

Real Cloudflare, GitHub, and AWS assertions live behind opt-in integration
lanes documented in `docs/integration-testing.md`.
