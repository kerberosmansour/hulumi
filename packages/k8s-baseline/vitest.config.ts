import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/integration/**", "node_modules/**", "dist/**"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    reporters: "default",
    // Unhandled rejections are suite failures. Expected FailClosedError
    // cases must remain explicitly observed by their regression tests.
  },
});
