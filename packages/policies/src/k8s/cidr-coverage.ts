// Self-contained CIDR validation + internet-coverage detection.
//
// Duplicated from `@hulumi/k8s-baseline`'s `src/cidr-coverage.ts` because the
// two packages are separate; cross-package imports between sibling packages
// in this workspace are awkward, and adding a new npm dependency would
// trigger the dependabot exact-pin / cooling-off gate. The helper is pure
// and tiny (no network, no clock, no globals), so a careful duplicate is
// preferable to a fragile cross-package import or a new dependency.
//
// Keep the two copies in sync when updating coverage semantics.

export type IpFamily = "ipv4" | "ipv6";

interface ParsedCidr {
  family: IpFamily;
  start: bigint;
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
    if (!/^\d{1,3}$/.test(part)) return undefined;
    if (part.length > 1 && part.startsWith("0")) return undefined;
    const n = Number(part);
    if (n > 255) return undefined;
    value = (value << 8n) | BigInt(n);
  }
  return value;
}

function parseIpv6(addr: string): bigint | undefined {
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
    if ((value & mask) !== 0n) return undefined;
    return { family: "ipv6", start: value, end: value | mask, prefixLen };
  }

  const value = parseIpv4(addrPart);
  if (value === undefined || prefixLen > 32) return undefined;
  const hostBits = IPV4_BITS - BigInt(prefixLen);
  const mask = hostBits === 0n ? 0n : (1n << hostBits) - 1n;
  if ((value & mask) !== 0n) return undefined;
  return { family: "ipv4", start: value, end: value | mask, prefixLen };
}

export interface CidrCoverageResult {
  malformed?: string;
  coversInternet: boolean;
  family?: IpFamily;
}

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
    if (sorted[0].start !== 0n) continue;

    let covered = sorted[0].end;
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      if (next.start > covered + 1n) break;
      if (next.end > covered) covered = next.end;
    }
    if (covered >= familyMax) {
      return { coversInternet: true, family };
    }
  }

  return { coversInternet: false };
}
