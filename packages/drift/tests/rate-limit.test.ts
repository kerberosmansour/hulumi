// S7 — cache-based rate limit. Within the cache TTL, repeated
// classify() calls return the cached verdict and the adapters are
// NOT re-invoked.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DriftClassifier } from "../src/classifier";
import type { AdapterSignal, DriftAdapter } from "../src/types";

class CountingAdapter implements DriftAdapter {
  public count = 0;
  constructor(
    private readonly _name: string,
    private readonly _detected: boolean,
  ) {}
  name(): string {
    return this._name;
  }
  async available(): Promise<boolean> {
    return true;
  }
  async signal(): Promise<AdapterSignal> {
    this.count += 1;
    return { detected: this._detected, ok: true, data: {} };
  }
}

describe("rate-limit — cache TTL short-circuits adapters (S7)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-rl-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("first call invokes all adapters; second call inside TTL invokes none", async () => {
    const auto = new CountingAdapter("AutomationApi", true);
    const ct = new CountingAdapter("CloudTrail", false);
    const pv = new CountingAdapter("ProviderVersion", false);
    const gl = new CountingAdapter("GitLog", false);
    const probe = vi.fn().mockResolvedValue({ delivered: false, inTransit: false });

    const classifier = new DriftClassifier({
      adapters: { automationApi: auto, cloudTrail: ct, providerVersion: pv, gitLog: gl },
      probe,
    });
    const opts = { cacheDir: dir, cacheTtlSeconds: 60 };

    const v1 = await classifier.classify("stack", "urn:r1", opts);
    expect(v1.source).toBeDefined();
    expect(auto.count).toBe(1);
    expect(ct.count).toBe(1);
    expect(pv.count).toBe(1);
    expect(gl.count).toBe(1);
    expect(probe).toHaveBeenCalledTimes(1);

    const v2 = await classifier.classify("stack", "urn:r1", opts);
    expect(v2).toEqual(v1);
    // Adapters NOT re-invoked.
    expect(auto.count).toBe(1);
    expect(ct.count).toBe(1);
    expect(pv.count).toBe(1);
    expect(gl.count).toBe(1);
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
