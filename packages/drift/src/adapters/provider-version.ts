// ProviderVersionAdapter — compares the pinned `@pulumi/aws` version
// in `pnpm-lock.yaml` against the latest available on the npm
// registry. A pinned-vs-latest delta is a signal that a recently
// released provider may have surfaced API changes the IaC has not
// yet adopted (Row 4 of the verdict matrix → ProviderApiChurn /
// medium).

import type { AdapterSignal, DriftAdapter } from "../types";

export interface ProviderVersionFetcher {
  pinned(): Promise<string>;
  latest(): Promise<string>;
}

export interface ProviderVersionAdapterArgs {
  fetcher: ProviderVersionFetcher;
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const partsA = a.split(".").map((s) => parseInt(s, 10) || 0);
  const partsB = b.split(".").map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const av = partsA[i] ?? 0;
    const bv = partsB[i] ?? 0;
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

export class ProviderVersionAdapter implements DriftAdapter {
  constructor(private readonly args: ProviderVersionAdapterArgs) {}

  name(): string {
    return "ProviderVersion";
  }

  async available(): Promise<boolean> {
    return true;
  }

  async signal(): Promise<AdapterSignal> {
    let pinned: string;
    let latest: string;
    try {
      pinned = await this.args.fetcher.pinned();
      latest = await this.args.fetcher.latest();
    } catch (err) {
      return {
        detected: false,
        ok: false,
        data: { error: err instanceof Error ? err.message : String(err) },
      };
    }
    const cmp = compareSemver(pinned, latest);
    return {
      detected: cmp < 0,
      ok: true,
      data: { pinned, latest, comparison: cmp },
    };
  }
}
