import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**", "dist/**"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    reporters: "default",
    // M2 fail-closed BDD scenarios throw `FailClosedError` inside Pulumi
    // apply chains. Pulumi's `cmd/run` path installs an unhandled-rejection
    // handler in production; the mock runtime in tests does not. The
    // per-file `process.on("unhandledRejection")` listeners filter these
    // (only FailClosedError is suppressed); this flag stops vitest from
    // also flagging them as suite-level errors.
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
