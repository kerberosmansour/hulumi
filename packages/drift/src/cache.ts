// On-disk cache for DriftVerdict entries.
//
// - File mode 0o600 always (S2). Helper enforces; classifier never opens
//   a cache file with default umask.
// - Owner check on read: if the file's owner UID does not match
//   `process.getuid()`, treat as absent and re-run with an
//   `cacheOwnershipMismatch` evidence entry.
// - TTL: default 6h (21600s). Past TTL → treat as absent.
// - Cache IS the rate-limit (S7): within TTL, repeat classify calls
//   short-circuit to the cached verdict; adapters are not re-invoked.

import { createHash } from "node:crypto";
import { promises as fs, statSync, constants as fsConstants } from "node:fs";
import { dirname, join } from "node:path";

import type { DriftVerdict } from "./types";

// v1 → v2 schema bump in v1.1.0 M4 (Hulumi-for-GitHub, 2026-04-26).
// v2 envelope adds an optional `githubWebhookCache` field for the M4
// webhook-fallback adapter's idempotency cache. Migration runs on first
// read of a v1 file; backed-up v1 file is preserved at `<cache>.v1.backup`
// for one rotation. `migrateV1ToV2` is the atomic entry point — never
// v2-write before backup-write.
export const CACHE_SCHEMA_VERSION = 2 as const;
export const CACHE_SCHEMA_V1_LEGACY = 1 as const;

export interface CacheEnvelope {
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
  writtenAt: string;
  verdict: DriftVerdict;
  /** Added in v2; opaque to the cache module — owned by the GitHub adapter. */
  githubWebhookCache?: Record<string, { ingestedAt: string }>;
}

/**
 * Legacy v1 envelope shape, kept for migration only. Tests that seed a v1
 * file should use this type to construct the seed.
 */
export interface CacheEnvelopeV1 {
  schemaVersion: typeof CACHE_SCHEMA_V1_LEGACY;
  writtenAt: string;
  verdict: DriftVerdict;
}

export interface CacheReadResult {
  envelope?: CacheEnvelope;
  /** When undefined, the absence reason is set. */
  absenceReason?: "missing" | "expired" | "ownership-mismatch" | "schema-mismatch" | "parse-error";
}

export function cachePathFor(cacheDir: string, stackUrn: string, resource: string): string {
  const hash = createHash("sha256").update(`${stackUrn}::${resource}`).digest("hex").slice(0, 32);
  return join(cacheDir, `${hash}.json`);
}

export async function readCache(
  path: string,
  ttlSeconds: number,
  now: Date = new Date(),
): Promise<CacheReadResult> {
  let raw: string;
  try {
    await fs.access(path, fsConstants.R_OK);
    const stat = statSync(path);
    if (typeof process.getuid === "function" && stat.uid !== process.getuid()) {
      return { absenceReason: "ownership-mismatch" };
    }
    raw = await fs.readFile(path, "utf8");
  } catch {
    return { absenceReason: "missing" };
  }
  let parsed: CacheEnvelope;
  try {
    parsed = JSON.parse(raw) as CacheEnvelope;
  } catch {
    return { absenceReason: "parse-error" };
  }
  if (parsed.schemaVersion !== CACHE_SCHEMA_VERSION) {
    return { absenceReason: "schema-mismatch" };
  }
  const writtenAt = new Date(parsed.writtenAt);
  const ageMs = now.getTime() - writtenAt.getTime();
  if (ageMs > ttlSeconds * 1000) {
    return { absenceReason: "expired" };
  }
  return { envelope: parsed };
}

export async function writeCache(path: string, envelope: CacheEnvelope): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true });
  // Open with explicit 0o600 mode + write-truncate-create. Avoids any
  // window where the file exists with the default umask before chmod.
  const fh = await fs.open(path, "w", 0o600);
  try {
    await fh.writeFile(JSON.stringify(envelope, null, 2));
    await fh.chmod(0o600);
  } finally {
    await fh.close();
  }
}

export async function invalidateCache(path: string): Promise<void> {
  try {
    await fs.unlink(path);
  } catch {
    // missing → fine
  }
}

/**
 * Migrate a v1 cache file to v2 in-place. Atomic write order:
 *   1. read v1 file
 *   2. write `<path>.v1.backup` preserving original bytes
 *   3. construct v2 envelope (adds optional `githubWebhookCache: {}`)
 *   4. atomic write to `<path>` with mode 0o600
 *
 * Failure modes are loud — malformed v1 files fail with a clear message
 * and no v2 file is written (so subsequent reads still see the v1 input
 * and the migration can be retried after the operator inspects the
 * malformed file).
 *
 * Per critique S5 + M4 design rule: never v2-write before backup-write.
 */
export async function migrateV1ToV2(path: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(path, "utf8");
  } catch {
    throw new Error(`migrateV1ToV2: cannot read v1 cache file at ${path}`);
  }
  let parsed: CacheEnvelopeV1;
  try {
    parsed = JSON.parse(raw) as CacheEnvelopeV1;
  } catch (err) {
    throw new Error(
      `migrateV1ToV2: cannot parse v1 cache file at ${path}: ${String(err)}; original file untouched`,
    );
  }
  if (parsed.schemaVersion !== CACHE_SCHEMA_V1_LEGACY) {
    throw new Error(
      `migrateV1ToV2: unexpected schemaVersion ${String(parsed.schemaVersion)} at ${path}; expected v1=${CACHE_SCHEMA_V1_LEGACY}`,
    );
  }
  // Step 1 of the atomic order: backup-then-v2-write. The backup is the
  // raw bytes (preserves any whitespace / formatting) so the operator
  // can diff vs the v2 product if anything looks wrong.
  const backupPath = `${path}.v1.backup`;
  const backupFh = await fs.open(backupPath, "w", 0o600);
  try {
    await backupFh.writeFile(raw);
    await backupFh.chmod(0o600);
  } finally {
    await backupFh.close();
  }
  const v2: CacheEnvelope = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    writtenAt: parsed.writtenAt,
    verdict: parsed.verdict,
    githubWebhookCache: {},
  };
  await writeCache(path, v2);
}
