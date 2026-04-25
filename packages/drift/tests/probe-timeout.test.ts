// E1 — probe timeout graceful degradation. When the CloudTrail
// delivery probe hangs, runProbe() aborts after `timeoutMs` and
// returns ok=false with `probeFailedAt` populated.

import { describe, it, expect } from "vitest";
import { runProbe } from "../src/probe";

describe("probe timeout — E1", () => {
  it("aborts on timeout and returns ok=false + probeFailedAt", async () => {
    const result = await runProbe({
      timeoutMs: 50,
      probe: async (signal: AbortSignal): Promise<{ delivered: boolean; inTransit: boolean }> => {
        // Hang until aborted.
        await new Promise<void>((_resolve, reject) => {
          if (signal.aborted) reject(new Error("aborted"));
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
        return { delivered: false, inTransit: false };
      },
    });
    expect(result.ok).toBe(false);
    expect(result.eventDelivered).toBe(false);
    expect(result.probeFailedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("returns ok=true when probe resolves before timeout", async () => {
    const result = await runProbe({
      timeoutMs: 200,
      probe: async (): Promise<{ delivered: boolean; inTransit: boolean }> => {
        return { delivered: true, inTransit: false };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.eventDelivered).toBe(true);
  });
});
