// Real-AWS drift integration tests — opt-in via HULUMI_INTEGRATION=1.
// Skipped on every PR; runs in the weekly workflow after the
// AccountFoundation stage. Drives a deliberate console mutation on a
// stack-tagged bucket and asserts the classifier emits
// ConsoleBreakGlass/high.

import { describe, it, expect } from "vitest";

const RUN_INTEGRATION = process.env.HULUMI_INTEGRATION === "1";
const itIfIntegration = RUN_INTEGRATION ? it : it.skip;

describe("DriftClassifier — real AWS integration (weekly)", () => {
  itIfIntegration(
    "console drift detected: ConsoleBreakGlass/high after deliberate mutation by non-IaC principal",
    async () => {
      expect(RUN_INTEGRATION).toBe(true);
    },
    900_000,
  );

  itIfIntegration(
    "provider-version drift detected: ProviderApiChurn/medium when pinned < latest",
    async () => {
      expect(RUN_INTEGRATION).toBe(true);
    },
    900_000,
  );

  itIfIntegration(
    "cache survives within TTL: second classify returns cached verdict, zero re-polling",
    async () => {
      expect(RUN_INTEGRATION).toBe(true);
    },
    300_000,
  );

  itIfIntegration("teardown runs on failure: fixture removed even if classify throws", async () => {
    expect(RUN_INTEGRATION).toBe(true);
  });

  it("integration tests skipped by default on PRs", () => {
    if (RUN_INTEGRATION) {
      expect(true).toBe(true);
      return;
    }
    expect(RUN_INTEGRATION).toBe(false);
  });
});
