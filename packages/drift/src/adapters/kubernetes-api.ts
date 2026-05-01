// KubernetesApiAdapter — drift signal from a live Kubernetes API server.
// Polls a small set of high-risk resource kinds (RBAC bindings, NetworkPolicies,
// AdmissionConfiguration) and compares the live state to a stored "desired"
// snapshot. Bounded probe budget; returns a `degraded` signal on timeout.
//
// Pure shape — no @kubernetes/client-node import here. Consumers wire a
// small fetcher interface so the adapter is testable without a live cluster.

import type { AdapterSignal, DriftAdapter } from "../types";

export interface KubernetesApiSnapshot {
  /** Stable hash / structural digest of the K8s API state for the watched resources. */
  digest: string;
  /** Optional human-readable list of items that changed. */
  changedKinds?: string[];
}

export interface KubernetesApiFetcher {
  /** Fetch a snapshot of the watched resource kinds from the live API server. */
  liveSnapshot(): Promise<KubernetesApiSnapshot>;
  /** Fetch the stored desired snapshot (e.g. from a Pulumi state-derived cache). */
  desiredSnapshot(): Promise<KubernetesApiSnapshot>;
}

export interface KubernetesApiAdapterArgs {
  fetcher: KubernetesApiFetcher;
  /** Probe budget in milliseconds. Required (M6 invariant: no unbounded waits). */
  probeTimeoutMs: number;
}

const ADAPTER_NAME = "KubernetesApi";

function withTimeout<T>(p: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`KubernetesApiAdapter: ${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((err) => {
      clearTimeout(t);
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

export class KubernetesApiAdapter implements DriftAdapter {
  constructor(private readonly args: KubernetesApiAdapterArgs) {
    if (typeof args.probeTimeoutMs !== "number" || args.probeTimeoutMs <= 0) {
      throw new Error(
        `KubernetesApiAdapter: probeTimeoutMs is required and must be > 0 (got ${args.probeTimeoutMs})`,
      );
    }
  }

  name(): string {
    return ADAPTER_NAME;
  }

  async available(): Promise<boolean> {
    return true;
  }

  async signal(): Promise<AdapterSignal> {
    let live: KubernetesApiSnapshot;
    let desired: KubernetesApiSnapshot;
    try {
      [live, desired] = await Promise.all([
        withTimeout(this.args.fetcher.liveSnapshot(), this.args.probeTimeoutMs, "liveSnapshot"),
        withTimeout(
          this.args.fetcher.desiredSnapshot(),
          this.args.probeTimeoutMs,
          "desiredSnapshot",
        ),
      ]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // Bounded-probe-failure semantics: degraded/low-confidence rather than
      // "no drift detected" (which would be a false negative).
      return {
        detected: false,
        ok: false,
        data: { error: errMsg, degraded: true },
      };
    }
    if (live.digest === desired.digest) {
      return { detected: false, ok: true, data: { matched: true } };
    }
    return {
      detected: true,
      ok: true,
      data: {
        liveDigest: live.digest,
        desiredDigest: desired.digest,
        ...(live.changedKinds !== undefined ? { changedKinds: live.changedKinds } : {}),
      },
    };
  }
}
