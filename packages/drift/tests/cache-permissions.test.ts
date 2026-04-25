// S2 — cache file mode 0o600 always.
//
// `writeCache()` opens with explicit mode + chmod, so the file is
// never world-readable even momentarily. Owner-check on read refuses
// foreign-UID files (returns absenceReason: "ownership-mismatch").

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, statSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CACHE_SCHEMA_VERSION,
  cachePathFor,
  readCache,
  writeCache,
  type CacheEnvelope,
} from "../src/cache";
import type { DriftVerdict } from "../src/types";

describe("cache permissions — S2", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hulumi-drift-cache-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes cache file with mode 0o600", async () => {
    const verdict: DriftVerdict = {
      resource: "urn:p::s::aws:s3/bucketV2:BucketV2::r1",
      source: "ConsoleBreakGlass",
      confidence: "high",
      evidence: [],
    };
    const envelope: CacheEnvelope = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
      verdict,
    };
    const path = cachePathFor(dir, "stack-urn", "urn:r1");
    await writeCache(path, envelope);
    const st = statSync(path);
    expect(st.mode & 0o777).toBe(0o600);
  });

  it("read flagged as ownership-mismatch when file UID differs", async () => {
    const path = cachePathFor(dir, "stack-urn", "urn:r1");
    const envelope: CacheEnvelope = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      writtenAt: new Date().toISOString(),
      verdict: { resource: "urn:r1", source: "None", confidence: "none", evidence: [] },
    };
    await writeCache(path, envelope);

    // Stub process.getuid so the file appears to belong to a different
    // user (we can't actually chown without root). The cache reader
    // treats a mismatch as ownership-mismatch absence.
    const original = process.getuid;
    const realUid = original ? original() : 0;
    Object.defineProperty(process, "getuid", { value: () => realUid + 999, configurable: true });
    try {
      const r = await readCache(path, 60);
      expect(r.envelope).toBeUndefined();
      expect(r.absenceReason).toBe("ownership-mismatch");
    } finally {
      Object.defineProperty(process, "getuid", { value: original, configurable: true });
    }
  });

  it("treats expired cache as absent (TTL elapsed)", async () => {
    const path = cachePathFor(dir, "stack-urn", "urn:r1");
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const envelope: CacheEnvelope = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      writtenAt: past,
      verdict: { resource: "urn:r1", source: "None", confidence: "none", evidence: [] },
    };
    await writeCache(path, envelope);
    const r = await readCache(path, 60);
    expect(r.envelope).toBeUndefined();
    expect(r.absenceReason).toBe("expired");
  });

  it("refuses schema-mismatch", async () => {
    const path = cachePathFor(dir, "stack-urn", "urn:r1");
    const { promises: fsP } = await import("node:fs");
    await fsP.writeFile(
      path,
      JSON.stringify({ schemaVersion: 999, writtenAt: new Date().toISOString(), verdict: {} }),
      { mode: 0o600 },
    );
    chmodSync(path, 0o600);
    const r = await readCache(path, 60);
    expect(r.absenceReason).toBe("schema-mismatch");
  });
});
