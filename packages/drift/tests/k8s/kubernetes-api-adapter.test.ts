import { describe, expect, test } from "vitest";

import {
  KubernetesApiAdapter,
  type KubernetesApiSnapshot,
} from "../../src/adapters/kubernetes-api";

function snap(digest: string, changedKinds?: string[]): KubernetesApiSnapshot {
  return changedKinds === undefined ? { digest } : { digest, changedKinds };
}

describe("KubernetesApiAdapter — happy paths", () => {
  test("matched digests → no drift detected", async () => {
    const a = new KubernetesApiAdapter({
      probeTimeoutMs: 1000,
      fetcher: {
        liveSnapshot: async () => snap("abc"),
        desiredSnapshot: async () => snap("abc"),
      },
    });
    const sig = await a.signal();
    expect(sig.detected).toBe(false);
    expect(sig.ok).toBe(true);
    expect(sig.data).toEqual({ matched: true });
  });

  test("Scenario: drift detects RBAC binding added (digest mismatch)", async () => {
    const a = new KubernetesApiAdapter({
      probeTimeoutMs: 1000,
      fetcher: {
        liveSnapshot: async () =>
          snap("live-digest", ["rbac.authorization.k8s.io/v1:ClusterRoleBinding"]),
        desiredSnapshot: async () => snap("desired-digest"),
      },
    });
    const sig = await a.signal();
    expect(sig.detected).toBe(true);
    expect(sig.ok).toBe(true);
    const data = sig.data as { changedKinds: string[] };
    expect(data.changedKinds).toContain("rbac.authorization.k8s.io/v1:ClusterRoleBinding");
  });
});

describe("KubernetesApiAdapter — bounded probe", () => {
  test("Scenario: drift probe timeout bounded (returns degraded/low confidence)", async () => {
    const a = new KubernetesApiAdapter({
      probeTimeoutMs: 50,
      fetcher: {
        liveSnapshot: () => new Promise(() => undefined), // hangs forever
        desiredSnapshot: async () => snap("d"),
      },
    });
    const start = Date.now();
    const sig = await a.signal();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(sig.detected).toBe(false);
    expect(sig.ok).toBe(false);
    const data = sig.data as { degraded?: boolean; error?: string };
    expect(data.degraded).toBe(true);
    expect(data.error).toMatch(/timed out after 50ms/);
  });
});

describe("KubernetesApiAdapter — invalid input refusals", () => {
  test("missing probeTimeoutMs rejected", () => {
    expect(
      () =>
        new KubernetesApiAdapter({
          probeTimeoutMs: 0 as unknown as number,
          fetcher: {
            liveSnapshot: async () => snap("a"),
            desiredSnapshot: async () => snap("a"),
          },
        }),
    ).toThrow(/probeTimeoutMs is required and must be > 0/);
  });
});
