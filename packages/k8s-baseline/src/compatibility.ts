import * as pulumi from "@pulumi/pulumi";

/**
 * Chart-version compatibility table for `@hulumi/k8s-baseline` Helm-using
 * components. Source of truth at runtime; the human-readable mirror lives at
 * `COMPATIBILITY.md`. Entries are added per chart introduction (M2 adds
 * Istio's three charts; future milestones append).
 *
 * The shape is `Record<chartName, readonly string[]>` so the typed `as const`
 * preserves the literal-string union for downstream type-narrowing.
 */
export const TESTED_VERSIONS = {
  // M2 — IstioFoundation. The three Istio charts ship version-pinned together;
  // mixing versions is unsupported.
  istiod: ["1.24.2"],
  cni: ["1.24.2"],
  gateway: ["1.24.2"],
  // Issue #137 — MetricsServer. Chart 3.13.0 ships metrics-server app v0.8.0.
  "metrics-server": ["3.13.0"],
} as const;

export type TestedChartName = keyof typeof TESTED_VERSIONS;

/**
 * Emit a `pulumi.log.warn` if `chart`+`version` isn't in `TESTED_VERSIONS`.
 * Never throws — the consumer pins to whichever version they need; Hulumi's
 * compatibility table is informative, not gate-keeping (per Rule 8 in the
 * Hulumi-K8s runbook).
 */
export function assertVersionTested(chart: string, version: string): void {
  const tested = (TESTED_VERSIONS as Record<string, readonly string[]>)[chart];
  if (tested === undefined) {
    pulumi.log.warn(
      `@hulumi/k8s-baseline: chart "${chart}" is not in COMPATIBILITY.md; the version "${version}" has not been exercised by Hulumi's CI. Proceeding — see packages/k8s-baseline/COMPATIBILITY.md to record the verification.`,
    );
    return;
  }
  if (!tested.includes(version)) {
    pulumi.log.warn(
      `@hulumi/k8s-baseline: chart "${chart}" version "${version}" is not in the tested list (${tested.join(", ")}); proceeding — see packages/k8s-baseline/COMPATIBILITY.md.`,
    );
  }
}
