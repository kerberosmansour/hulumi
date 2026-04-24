import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["**/*.test.ts"],
    testTimeout: 15000,
    reporters: "default",
  },
});
