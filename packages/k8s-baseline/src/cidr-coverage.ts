// Self-contained CIDR validation + internet-coverage detection.
//
// A fail-closed control that keys on exact-literal membership (e.g.
// `["0.0.0.0/0", "::/0"]`) is trivially bypassed by a semantically
// equivalent split: `["0.0.0.0/1", "128.0.0.0/1"]` collectively covers
// the entire IPv4 space but neither entry matches the literal `0.0.0.0/0`.
//
// This helper parses each CIDR to a numeric (network, prefixLen) pair and
// asks the real question: does the union of the supplied ranges cover the
// entire address family? No external dependency (BigInt-only) so this does
// not trip the exact-pin / cooling-off supply-chain gate.

export type IpFamily = "ipv4" | "ipv6";

interface ParsedCidr {
  family: IpFamily;
  /** First address in the block, as a BigInt. */
  start: bigint;
  /** Last address in the block, as a BigInt. */
  end: bigint;
  prefixLen: number;
}

const IPV4_BITS = 32n;
const IPV6_BITS = 128n;
const IPV4_MAX = (1n << IPV4_BITS) - 1n;
const IPV6_MAX = (1n << IPV6_BITS) - 1n;

function parseIpv4(addr: string): bigint | undefined {
  const parts = addr.split(".");
  if (parts.length !== 4) return undefined;
  let value = 0n;
  for (const part of parts) {
    // Reject empty, non-numeric, leading-zero ("01"), or out-of-range octets.
    if (!/^\d{1,3}$/.test(part)) return undefined;
    if (part.length > 1 && part.startsWith("0")) return undefined;
    const n = Number(part);
    if (n > 255) return undefined;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function parseIpv6(addr: string): bigint | undefined {
  // No embedded IPv4-in-IPv6 (e.g. ::ffff:1.2.3.4) handling: CIDR entries
  // for SG/endpoint allow-lists are hextet form in practice. Reject the
  // dotted-quad tail rather than silently mis-parse it.
  if (addr.includes(".")) return undefined;
  const doubleColonCount = (addr.match(/::/g) ?? []).length;
  if (doubleColonCount > 1) return undefined;

  let head: string[];
  let tail: string[];
  if (doubleColonCount === 1) {
    const [h, t] = addr.split("::");
    head = h === "" ? [] : h.split(":");
    tail = t === "" ? [] : t.split(":");
  } else {
    head = addr.split(":");
    tail = [];
  }

  const hextets = [...head, ...tail];
  if (doubleColonCount === 0 && hextets.length !== 8) return undefined;
  if (doubleColonCount === 1 && hextets.length >= 8) return undefined;
  if (head.length + tail.length > 8) return undefined;

  for (const h of hextets) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(h)) return undefined;
  }

  const zeros = 8 - (head.length + tail.length);
  const full = [...head, ...Array<string>(doubleColonCount === 1 ? zeros : 0).fill("0"), ...tail];
  if (full.length !== 8) return undefined;

  let value = 0n;
  for (const h of full) {
    value = (value << 16n) | BigInt(parseInt(h, 16));
  }
  return value;
}

/**
 * Parse a single CIDR string. Returns `undefined` for any syntactically
 * malformed input (the previous control accepted any non-blank string).
 */
export function parseCidr(cidr: string): ParsedCidr | undefined {
  const slash = cidr.indexOf("/");
  if (slash === -1) return undefined;
  const addrPart = cidr.slice(0, slash);
  const prefixPart = cidr.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefixPart)) return undefined;
  if (prefixPart.length > 1 && prefixPart.startsWith("0")) return undefined;
  const prefixLen = Number(prefixPart);

  const isV6 = addrPart.includes(":");
  if (isV6) {
    const value = parseIpv6(addrPart);
    if (value === undefined || prefixLen > 128) return undefined;
    const hostBits = IPV6_BITS - BigInt(prefixLen);
    const mask = hostBits === 0n ? 0n : (1n << hostBits) - 1n;
    // Reject CIDRs whose host bits are set (non-canonical network address).
    if ((value & mask) !== 0n) return undefined;
    return {
      family: "ipv6",
      start: value,
      end: value | mask,
      prefixLen,
    };
  }

  const value = parseIpv4(addrPart);
  if (value === undefined || prefixLen > 32) return undefined;
  const hostBits = IPV4_BITS - BigInt(prefixLen);
  const mask = hostBits === 0n ? 0n : (1n << hostBits) - 1n;
  if ((value & mask) !== 0n) return undefined;
  return {
    family: "ipv4",
    start: value,
    end: value | mask,
    prefixLen,
  };
}

export interface CidrCoverageResult {
  /** A malformed CIDR string, if any was supplied. */
  malformed?: string;
  /** True if the supplied set covers the entire address space of a family. */
  coversInternet: boolean;
  /** Which family the full-coverage union belongs to (if `coversInternet`). */
  family?: IpFamily;
}

/**
 * Decide whether `values` (a mixed IPv4/IPv6 CIDR list) collectively covers
 * the entire address space of either family, or contains a malformed entry.
 *
 * Coverage is computed per family by merging sorted [start,end] intervals and
 * checking the merged span equals the full family range. A single entry with
 * prefix length 0 trivially covers its family; so does any union of narrower
 * blocks whose ranges merge to the whole space (the split-range bypass).
 */
export function analyzeCidrCoverage(values: readonly string[]): CidrCoverageResult {
  const byFamily: Record<IpFamily, ParsedCidr[]> = { ipv4: [], ipv6: [] };

  for (const raw of values) {
    const parsed = parseCidr(raw);
    if (parsed === undefined) {
      return { malformed: raw, coversInternet: false };
    }
    byFamily[parsed.family].push(parsed);
  }

  for (const family of ["ipv4", "ipv6"] as const) {
    const blocks = byFamily[family];
    if (blocks.length === 0) continue;
    const familyMax = family === "ipv4" ? IPV4_MAX : IPV6_MAX;

    const sorted = [...blocks].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

    // The whole space starts at 0; if the lowest block does not, no full
    // coverage is possible for this family.
    if (sorted[0].start !== 0n) continue;

    let covered = sorted[0].end;
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      // A gap exists only when the next block starts strictly beyond
      // covered+1; adjacent or overlapping blocks extend coverage.
      if (next.start > covered + 1n) break;
      if (next.end > covered) covered = next.end;
    }
    if (covered >= familyMax) {
      return { coversInternet: true, family };
    }
  }

  return { coversInternet: false };
}
