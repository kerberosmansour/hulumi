// Fail-closed regression suite for two MED findings, one root cause:
// classifier.ts built VerdictSnapshot only from adapter `detected`
// booleans, discarding adapter `ok` (failure) state and the real
// CloudTrail audit evidence `ct.detected`.
//
// M-ADAPTERFAIL: a rejected/failed required adapter (esp. the
//   Automation-API `auto`) was unwrapped as {detected:false, ok:false};
//   `ok` was ignored → mutated=false → None/none, which was then cached.
//   Subsequent calls within TTL short-circuited from that fail-open
//   cache entry. Expected: degrade to the existing probe-failure verdict
//   (Unknown/low) AND do NOT write the degraded result to cache, so a
//   2nd call re-runs the adapters.
//
// M-MIXED: Mixed / ConsoleBreakGlass promotion fired on probe liveness
//   (snapshot.eventDelivered) alone; the real ct.detected correction was
//   skipped when the probe was healthy. A healthy probe + Automation
//   diff + providerDrift + ct.detected:false was over-promoted to
//   Mixed/high. Expected: that case is NOT Mixed/ConsoleBreakGlass high
//   (it is the provider-churn verdict). A healthy probe WITH real
//   ct.detected must still escalate (control).

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DriftClassifier } from "../src/classifier";
import type { AdapterSignal, DriftAdapter } from "../src/types";

class StaticAdapter implements DriftAdapter {
  constructor(
    private readonly _name: string,
    private readonly signalResult: AdapterSignal,
  ) {}
  name(): string {
    return this._name;
  }
  async available(): Promise<boolean> {
    return true;
  }
  async signal(): Promise<AdapterSignal> {
    return this.signalResult;
  }
}

/** Counts invocations so we can prove cache short-circuit (or not). */
class CountingAdapter implements DriftAdapter {
  public count = 0;
  constructor(
    private readonly _name: string,
    private readonly signalResult: AdapterSignal,
  ) {}
  name(): string {
    return this._name;
  }
  async available(): Promise<boolean> {
    return true;
  }
  async signal(): Promise<AdapterSignal> {
    this.count += 1;
    return this.signalResult;
  }
}

/** Always rejects — models an Automation-API call that fails / is denied. */
class RejectingAdapter implements DriftAdapter {
  public count = 0;
  constructor(private readonly _name: string) {}
  name(): string {
    return this._name;
  }
  async available(): Promise<boolean> {
    return true;
  }
  async signal(): Promise<AdapterSignal> {
    this.count += 1;
    throw new Error(`${this._name} adapter rejected (simulated API failure)`);
  }
}

const clean: AdapterSignal = { detected: false, ok: true, data: {} };
const detected: AdapterSignal = { detected: true, ok: true, data: {} };
/** detected=false but the underlying API failed (degraded, not clean). */
const failed: AdapterSignal = { detected: false, ok: false, data: {} };

describe("classifier fail-closed — M-ADAPTERFAIL", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("Automation-API adapter rejection ⇒ degrade verdict (NOT None/none)", async () => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-failclosed-"));
    const classifier = new DriftClassifier({
      adapters: {
        automationApi: new RejectingAdapter("AutomationApi"),
        cloudTrail: new StaticAdapter("CloudTrail", clean),
        providerVersion: new StaticAdapter("ProviderVersion", clean),
        gitLog: new StaticAdapter("GitLog", clean),
      },
      probe: async () => ({ delivered: false, inTransit: false }),
    });

    const verdict = await classifier.classify("stack", "urn:r1", {
      cacheDir: dir,
      cacheTtlSeconds: 600,
    });

    // The fail-open bug returned None/none here. Fail-closed must degrade
    // to the existing probe-failure verdict (Unknown / low).
    expect(verdict.source).not.toBe("None");
    expect(verdict.confidence).not.toBe("none");
    expect(verdict.source).toBe("Unknown");
    expect(verdict.confidence).toBe("low");
  });

  it("Automation-API rejection is NOT written to cache (2nd call re-runs adapters)", async () => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-failclosed-"));
    const auto = new RejectingAdapter("AutomationApi");
    const ct = new CountingAdapter("CloudTrail", clean);
    const pv = new CountingAdapter("ProviderVersion", clean);
    const gl = new CountingAdapter("GitLog", clean);
    const classifier = new DriftClassifier({
      adapters: { automationApi: auto, cloudTrail: ct, providerVersion: pv, gitLog: gl },
      probe: async () => ({ delivered: false, inTransit: false }),
    });
    const opts = { cacheDir: dir, cacheTtlSeconds: 600 };

    const v1 = await classifier.classify("stack", "urn:r1", opts);
    expect(v1.source).toBe("Unknown");
    expect(auto.count).toBe(1);

    // Degraded verdict must NOT have been cached: the 2nd call inside TTL
    // must re-run every adapter rather than short-circuit fail-open.
    const v2 = await classifier.classify("stack", "urn:r1", opts);
    expect(v2.source).toBe("Unknown");
    expect(auto.count).toBe(2);
    expect(ct.count).toBe(2);
    expect(pv.count).toBe(2);
    expect(gl.count).toBe(2);
  });

  it("Automation-API ok=false (no reject) also degrades and is not cached", async () => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-failclosed-"));
    const auto = new CountingAdapter("AutomationApi", failed);
    const ct = new CountingAdapter("CloudTrail", clean);
    const pv = new CountingAdapter("ProviderVersion", clean);
    const gl = new CountingAdapter("GitLog", clean);
    const classifier = new DriftClassifier({
      adapters: { automationApi: auto, cloudTrail: ct, providerVersion: pv, gitLog: gl },
      probe: async () => ({ delivered: false, inTransit: false }),
    });
    const opts = { cacheDir: dir, cacheTtlSeconds: 600 };

    const v1 = await classifier.classify("stack", "urn:r1", opts);
    expect(v1.source).toBe("Unknown");
    expect(v1.confidence).toBe("low");

    const v2 = await classifier.classify("stack", "urn:r1", opts);
    expect(v2.source).toBe("Unknown");
    // Not short-circuited from a fail-open cache entry.
    expect(auto.count).toBe(2);
  });

  it("provider-version adapter failure also degrades fail-closed", async () => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-failclosed-"));
    const classifier = new DriftClassifier({
      adapters: {
        automationApi: new StaticAdapter("AutomationApi", detected),
        cloudTrail: new StaticAdapter("CloudTrail", clean),
        providerVersion: new RejectingAdapter("ProviderVersion"),
        gitLog: new StaticAdapter("GitLog", clean),
      },
      probe: async () => ({ delivered: false, inTransit: false }),
    });

    const verdict = await classifier.classify("stack", "urn:r1", {
      cacheDir: dir,
      cacheTtlSeconds: 600,
    });
    expect(verdict.source).toBe("Unknown");
    expect(verdict.confidence).toBe("low");
  });
});

describe("classifier fail-closed — M-MIXED (require real ct.detected)", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("healthy probe + Automation diff + providerDrift + ct.detected:false ⇒ NOT Mixed/high", async () => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-mixed-fc-"));
    const classifier = new DriftClassifier({
      adapters: {
        automationApi: new StaticAdapter("AutomationApi", detected),
        // CloudTrail did NOT actually observe a console event.
        cloudTrail: new StaticAdapter("CloudTrail", clean),
        providerVersion: new StaticAdapter("ProviderVersion", detected),
        gitLog: new StaticAdapter("GitLog", clean),
      },
      // Probe is healthy and "delivered" — but that is only probe
      // liveness, not real CloudTrail audit evidence.
      probe: async () => ({ delivered: true, inTransit: false }),
    });

    const verdict = await classifier.classify("stack", "urn:r1", {
      cacheDir: dir,
      cacheTtlSeconds: 0,
    });

    // Over-promotion bug yielded Mixed/high here. Without real
    // ct.detected the verdict must NOT escalate to Mixed or
    // ConsoleBreakGlass. With mutated + providerDrift the appropriate
    // non-escalated verdict is ProviderApiChurn / medium.
    expect(verdict.source).not.toBe("Mixed");
    expect(verdict.source).not.toBe("ConsoleBreakGlass");
    expect(verdict.confidence).not.toBe("high");
    expect(verdict.source).toBe("ProviderApiChurn");
    expect(verdict.confidence).toBe("medium");
  });

  it("healthy probe + Automation diff + no providerDrift + ct.detected:false ⇒ NOT ConsoleBreakGlass", async () => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-mixed-fc-"));
    const classifier = new DriftClassifier({
      adapters: {
        automationApi: new StaticAdapter("AutomationApi", detected),
        cloudTrail: new StaticAdapter("CloudTrail", clean),
        providerVersion: new StaticAdapter("ProviderVersion", clean),
        gitLog: new StaticAdapter("GitLog", clean),
      },
      probe: async () => ({ delivered: true, inTransit: false }),
    });

    const verdict = await classifier.classify("stack", "urn:r1", {
      cacheDir: dir,
      cacheTtlSeconds: 0,
    });

    expect(verdict.source).not.toBe("ConsoleBreakGlass");
    expect(verdict.source).not.toBe("Mixed");
    expect(verdict.confidence).not.toBe("high");
  });

  it("CONTROL: healthy probe WITH real ct.detected still escalates (Mixed/high)", async () => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-mixed-fc-"));
    const classifier = new DriftClassifier({
      adapters: {
        automationApi: new StaticAdapter("AutomationApi", detected),
        cloudTrail: new StaticAdapter("CloudTrail", detected),
        providerVersion: new StaticAdapter("ProviderVersion", detected),
        gitLog: new StaticAdapter("GitLog", clean),
      },
      probe: async () => ({ delivered: true, inTransit: false }),
    });

    const verdict = await classifier.classify("stack", "urn:r1", {
      cacheDir: dir,
      cacheTtlSeconds: 0,
    });

    // Real CloudTrail evidence present → escalation is correct.
    expect(verdict.source).toBe("Mixed");
    expect(verdict.confidence).toBe("high");
  });

  it("CONTROL: healthy probe WITH real ct.detected, no providerDrift ⇒ ConsoleBreakGlass/high", async () => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-mixed-fc-"));
    const classifier = new DriftClassifier({
      adapters: {
        automationApi: new StaticAdapter("AutomationApi", detected),
        cloudTrail: new StaticAdapter("CloudTrail", detected),
        providerVersion: new StaticAdapter("ProviderVersion", clean),
        gitLog: new StaticAdapter("GitLog", clean),
      },
      probe: async () => ({ delivered: true, inTransit: false }),
    });

    const verdict = await classifier.classify("stack", "urn:r1", {
      cacheDir: dir,
      cacheTtlSeconds: 0,
    });

    expect(verdict.source).toBe("ConsoleBreakGlass");
    expect(verdict.confidence).toBe("high");
  });
});
