// Integration vitest config for `@hulumi/k8s-baseline`. Flips the
// include/exclude vs `vitest.config.ts` so the kind/EKS lanes can run.
//
// Allow-list deviation rationale (Runbook
// `hulumi-operations-k8s-security` Milestone 1): the BDD contract
// requires kind- and EKS-gated tests under
// `tests/integration/{kind,eks}/`, but the default `vitest.config.ts`
// excludes `tests/integration/**` so those tests never run via
// `pnpm --filter @hulumi/k8s-baseline test`. A separate config is the
// smallest mechanical change that lets the integration lanes run on
// demand without polluting the default suite. The default config is
// intentionally untouched so unit-test contracts remain identical.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 60000,
    reporters: "default",
  },
});
