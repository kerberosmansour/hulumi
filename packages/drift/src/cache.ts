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

export const CACHE_SCHEMA_VERSION = 1 as const;

export interface CacheEnvelope {
  schemaVersion: typeof CACHE_SCHEMA_VERSION;
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
