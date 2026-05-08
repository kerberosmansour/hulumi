import { describe, it, expect } from "vitest";

import { CloudTrailAdapter, type CloudTrailEvent } from "../src/adapters/cloudtrail";

const event: CloudTrailEvent = {
  EventTime: new Date("2026-05-08T12:00:00Z"),
  EventName: "PutBucketTagging",
  Username: "console-user",
};

describe("CloudTrailAdapter retry budget", () => {
  it("retries transient lookup failures with bounded exponential delays", async () => {
    const waits: number[] = [];
    let attempts = 0;
    const adapter = new CloudTrailAdapter({
      retry: {
        attempts: 3,
        backoffMs: 40,
        maxElapsedMs: 120,
        wait: async (delayMs) => {
          waits.push(delayMs);
        },
      },
      lookup: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error(`transient-${attempts}`);
        return [event];
      },
    });

    const result = await adapter.signal("stack", "arn:aws:s3:::test");

    expect(result.ok).toBe(true);
    expect(result.detected).toBe(true);
    expect(attempts).toBe(3);
    expect(waits).toEqual([40, 80]);
  });

  it("stops before the next retry delay would exceed maxElapsedMs", async () => {
    const waits: number[] = [];
    let attempts = 0;
    const adapter = new CloudTrailAdapter({
      retry: {
        attempts: 4,
        backoffMs: 75,
        maxElapsedMs: 100,
        wait: async (delayMs) => {
          waits.push(delayMs);
        },
      },
      lookup: async () => {
        attempts += 1;
        throw new Error(`still-failing-${attempts}`);
      },
    });

    const result = await adapter.signal("stack", "arn:aws:s3:::test");

    expect(result.ok).toBe(false);
    expect(result.detected).toBe(false);
    expect(attempts).toBe(2);
    expect(waits).toEqual([75]);
    expect(result.data).toMatchObject({
      retryAttempts: 2,
      retryDelayMs: 75,
      retryExhausted: true,
    });
  });

  it("keeps one-attempt behavior when retry is omitted", async () => {
    let attempts = 0;
    const adapter = new CloudTrailAdapter({
      lookup: async () => {
        attempts += 1;
        throw new Error("single failure");
      },
    });

    const result = await adapter.signal("stack", "arn:aws:s3:::test");

    expect(result.ok).toBe(false);
    expect(result.detected).toBe(false);
    expect(attempts).toBe(1);
    expect(result.data).toMatchObject({ retryAttempts: 1, retryDelayMs: 0 });
  });
});
