// Integration vitest config for `@hulumi/drift`.
//
// The default package config excludes `tests/integration/**` so normal PR
// tests never touch real AWS. This config flips the include for explicit
// weekly/manual integration runs only.

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    testTimeout: 180000,
    reporters: "default",
  },
});
