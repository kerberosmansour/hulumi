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

const clean: AdapterSignal = { detected: false, ok: true, data: {} };
const detected: AdapterSignal = { detected: true, ok: true, data: {} };

describe("DriftClassifier — Mixed source composition", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("preserves Mixed when CloudTrail and provider-version evidence both detect drift", async () => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-mixed-"));
    const classifier = new DriftClassifier({
      adapters: {
        automationApi: new StaticAdapter("AutomationApi", detected),
        cloudTrail: new StaticAdapter("CloudTrail", detected),
        providerVersion: new StaticAdapter("ProviderVersion", detected),
        gitLog: new StaticAdapter("GitLog", clean),
      },
      probe: async () => ({ delivered: false, inTransit: false }),
    });

    const verdict = await classifier.classify("stack", "urn:r1", {
      cacheDir: dir,
      cacheTtlSeconds: 0,
    });

    expect(verdict.source).toBe("Mixed");
    expect(verdict.confidence).toBe("high");
  });
});
