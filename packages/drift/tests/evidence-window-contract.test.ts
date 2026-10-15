import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SimpleGit } from "simple-git";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CloudTrailAdapter } from "../src/adapters/cloudtrail";
import { GitLogAdapter } from "../src/adapters/git-log";
import { GithubWebhookFallbackAdapter } from "../src/adapters/github-webhook-fallback";
import { DriftClassifier } from "../src/classifier";
import type { AdapterSignal, DriftAdapter } from "../src/types";

const FIXED_NOW = "2026-10-15T12:34:56.789Z";
const EXPECTED_AFTER = "2026-10-14T12:34:56.789Z";
const VALID_WINDOW = {
  after: "2026-10-15T11:00:00.000Z",
  before: "2026-10-15T12:00:00.000Z",
};
const INVALID_WINDOWS = [
  { after: VALID_WINDOW.before, before: VALID_WINDOW.after },
  { after: "not-a-date", before: VALID_WINDOW.before },
] as const;

const clean: AdapterSignal = { detected: false, ok: true, data: {} };

class RecordingAdapter implements DriftAdapter {
  readonly windows: Array<{ before: string; after: string }> = [];

  constructor(private readonly adapterName: string) {}

  name(): string {
    return this.adapterName;
  }

  async available(): Promise<boolean> {
    return true;
  }

  async signal(
    _stack: string,
    _resource: string,
    window: { before: string; after: string },
  ): Promise<AdapterSignal> {
    this.windows.push(window);
    return clean;
  }
}

let cacheDir: string | undefined;

afterEach(() => {
  vi.useRealTimers();
  if (cacheDir !== undefined) rmSync(cacheDir, { recursive: true, force: true });
  cacheDir = undefined;
});

describe("classifier evidence-window contract", () => {
  it("uses one ordered 24-hour default window for every adapter", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    cacheDir = mkdtempSync(join(tmpdir(), "hulumi-window-contract-"));
    const adapters = [
      new RecordingAdapter("AutomationApi"),
      new RecordingAdapter("CloudTrail"),
      new RecordingAdapter("ProviderVersion"),
      new RecordingAdapter("GitLog"),
    ] as const;
    const classifier = new DriftClassifier({
      adapters: {
        automationApi: adapters[0],
        cloudTrail: adapters[1],
        providerVersion: adapters[2],
        gitLog: adapters[3],
      },
      probe: async () => ({ delivered: false, inTransit: false }),
    });

    await classifier.classify("stack", "urn:resource", {
      cacheDir,
      cacheTtlSeconds: 0,
    });

    for (const adapter of adapters) {
      expect(adapter.windows).toEqual([
        {
          after: EXPECTED_AFTER,
          before: FIXED_NOW,
        },
      ]);
    }
    expect(adapters[0].windows[0]).toBe(adapters[3].windows[0]);
  });

  it.each([
    {
      label: "reversed",
      window: { after: "2026-10-15T12:00:00.000Z", before: "2026-10-15T11:00:00.000Z" },
    },
    {
      label: "invalid",
      window: { after: "not-a-date", before: "2026-10-15T11:00:00.000Z" },
    },
  ])("rejects a $label explicit window before adapters or the probe run", async ({ window }) => {
    cacheDir = mkdtempSync(join(tmpdir(), "hulumi-window-contract-"));
    const adapter = new RecordingAdapter("recording");
    const probe = vi.fn().mockResolvedValue({ delivered: false, inTransit: false });
    const classifier = new DriftClassifier({
      adapters: {
        automationApi: adapter,
        cloudTrail: adapter,
        providerVersion: adapter,
        gitLog: adapter,
      },
      probe,
    });

    await expect(
      classifier.classify("stack", "urn:resource", {
        cacheDir,
        cacheTtlSeconds: 0,
        window,
      }),
    ).rejects.toThrow(/evidence window/i);
    expect(adapter.windows).toHaveLength(0);
    expect(probe).not.toHaveBeenCalled();
  });
});

describe("direct adapter evidence-window contract", () => {
  it("CloudTrail defaults to the ordered preceding 24 hours from one clock value", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    const lookup = vi.fn().mockResolvedValue([]);
    const adapter = new CloudTrailAdapter({ lookup });

    const result = await adapter.signal("stack", "arn:aws:s3:::test");

    expect(result.ok).toBe(true);
    expect(lookup).toHaveBeenCalledWith({
      resourceArn: "arn:aws:s3:::test",
      after: EXPECTED_AFTER,
      before: FIXED_NOW,
    });
  });

  it("CloudTrail rejects invalid or reversed windows before lookup", async () => {
    const lookup = vi.fn().mockResolvedValue([]);
    const adapter = new CloudTrailAdapter({ lookup });

    for (const window of INVALID_WINDOWS) {
      const result = await adapter.signal("stack", "arn:aws:s3:::test", window);
      expect(result.ok).toBe(false);
      expect(String(result.data.error)).toMatch(/evidence window/i);
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("GitLog maps after to --since and before to --until", async () => {
    const git = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      revparse: vi.fn().mockResolvedValue("false"),
      log: vi.fn().mockResolvedValue({ total: 0, latest: null, all: [] }),
    };
    const adapter = new GitLogAdapter({
      git: git as unknown as SimpleGit,
      paths: ["packages/baseline/src/**"],
    });

    const result = await adapter.signal(
      "stack",
      "urn:pulumi:dev::project::aws:s3/bucketV2:BucketV2::my-bucket",
      VALID_WINDOW,
    );

    expect(result.ok).toBe(true);
    expect(git.log).toHaveBeenCalledWith([
      `--since=${VALID_WINDOW.after}`,
      `--until=${VALID_WINDOW.before}`,
      "--",
      "packages/baseline/src/**",
    ]);
  });

  it("GitLog rejects invalid or reversed windows before repository or log lookup", async () => {
    const git = {
      checkIsRepo: vi.fn().mockResolvedValue(true),
      revparse: vi.fn().mockResolvedValue("false"),
      log: vi.fn().mockResolvedValue({ total: 0, latest: null, all: [] }),
    };
    const adapter = new GitLogAdapter({
      git: git as unknown as SimpleGit,
      paths: ["packages/baseline/src/**"],
    });

    for (const window of INVALID_WINDOWS) {
      const result = await adapter.signal(
        "stack",
        "urn:pulumi:dev::project::aws:s3/bucketV2:BucketV2::my-bucket",
        window,
      );
      expect(result.ok).toBe(false);
      expect(String(result.data.error)).toMatch(/evidence window/i);
    }
    expect(git.checkIsRepo).not.toHaveBeenCalled();
    expect(git.log).not.toHaveBeenCalled();
  });

  it("webhook fallback rejects invalid windows and keeps valid inclusive bounds", async () => {
    const adapter = new GithubWebhookFallbackAdapter({
      webhookSecret: () => "unused-in-sandbox",
      hulumiTier: "sandbox",
      allowUnsignedWebhooks: true,
    });
    const body = JSON.stringify({ repository: { full_name: "org/repo" } });
    const ingested = adapter.recordEvent({
      body,
      signature: undefined,
      deliveryId: "window-contract-1",
      eventType: "repository_ruleset",
      receivedAt: "2026-10-15T11:30:00.000Z",
    });
    expect(ingested.ok).toBe(true);

    for (const window of INVALID_WINDOWS) {
      const invalid = await adapter.signal("stack", "org/repo", window);
      expect(invalid.ok).toBe(false);
      expect(String(invalid.data.error)).toMatch(/evidence window/i);
    }

    const valid = await adapter.signal("stack", "org/repo", VALID_WINDOW);
    expect(valid.ok).toBe(true);
    expect(valid.detected).toBe(true);
    expect(valid.data.eventCount).toBe(1);
  });
});
