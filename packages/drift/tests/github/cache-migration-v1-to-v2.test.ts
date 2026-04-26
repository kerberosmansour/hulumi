// Cache schema v1 → v2 migration test (per critique S5 + M4 design rule).
// Atomic write order: backup-then-v2-write. Backup at `<cache>.v1.backup`.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CACHE_SCHEMA_VERSION,
  CACHE_SCHEMA_V1_LEGACY,
  migrateV1ToV2,
  readCache,
  type CacheEnvelopeV1,
} from "../../src/cache";

describe("Cache schema v1 → v2 migration (S5 atomic-write order)", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "hulumi-m4-cache-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("migrates a v1 file → v2 atomically; preserves AWS-side state", async () => {
    const path = join(tmp, "abcdef.json");
    const v1: CacheEnvelopeV1 = {
      schemaVersion: CACHE_SCHEMA_V1_LEGACY,
      writtenAt: "2026-04-26T10:00:00Z",
      verdict: {
        resource: "urn:pulumi:s::p::aws:s3/bucket:Bucket::test",
        source: "ConsoleBreakGlass",
        confidence: "high",
        evidence: [
          {
            adapter: "cloudtrail",
            signalKind: "console-mutation",
            raw: { eventName: "PutBucketAcl" },
            timestamp: "2026-04-26T09:55:00Z",
          },
        ],
      },
    };
    const originalBytes = JSON.stringify(v1, null, 2);
    await fs.writeFile(path, originalBytes, { mode: 0o600 });

    await migrateV1ToV2(path);

    // Backup file exists and contains original bytes.
    const backupBytes = await fs.readFile(`${path}.v1.backup`, "utf8");
    expect(backupBytes).toBe(originalBytes);

    // Primary file is now v2 shape.
    const v2Bytes = await fs.readFile(path, "utf8");
    const v2 = JSON.parse(v2Bytes);
    expect(v2.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
    expect(v2.writtenAt).toBe("2026-04-26T10:00:00Z");
    // AWS-side verdict + evidence preserved verbatim.
    expect(v2.verdict.resource).toBe(v1.verdict.resource);
    expect(v2.verdict.source).toBe("ConsoleBreakGlass");
    expect(v2.verdict.confidence).toBe("high");
    expect(v2.verdict.evidence).toHaveLength(1);
    expect(v2.verdict.evidence[0].adapter).toBe("cloudtrail");
    // New v2 field present + empty.
    expect(v2.githubWebhookCache).toEqual({});

    // readCache succeeds against the v2 file with default TTL.
    const result = await readCache(path, 86400, new Date("2026-04-26T11:00:00Z"));
    expect(result.envelope).toBeDefined();
    expect(result.envelope!.schemaVersion).toBe(CACHE_SCHEMA_VERSION);
  });

  it("aborts on malformed v1 file with no v2 file written", async () => {
    const path = join(tmp, "malformed.json");
    await fs.writeFile(path, "{ this is not valid JSON ", { mode: 0o600 });
    let error: Error | undefined;
    try {
      await migrateV1ToV2(path);
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/cannot parse v1 cache file/);
    // Original file untouched.
    const remaining = await fs.readFile(path, "utf8");
    expect(remaining).toBe("{ this is not valid JSON ");
    // No backup written when migration aborts pre-backup.
    let backupExists = true;
    try {
      await fs.access(`${path}.v1.backup`);
    } catch {
      backupExists = false;
    }
    expect(backupExists).toBe(false);
  });

  it("rejects file with unexpected schemaVersion", async () => {
    const path = join(tmp, "future.json");
    await fs.writeFile(
      path,
      JSON.stringify({ schemaVersion: 99, writtenAt: "2026-04-26T10:00:00Z", verdict: {} }),
      { mode: 0o600 },
    );
    let error: Error | undefined;
    try {
      await migrateV1ToV2(path);
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/unexpected schemaVersion/);
  });
});
