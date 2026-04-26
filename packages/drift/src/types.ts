// @hulumi/drift public types. The DriftSource enum values are LOCKED to
// the TLA+ Source set defined in docs/TLAdocs/hulumi/HulumiDrift.tla
// (upstream planning corpus). Adding/removing values here without
// updating the TLA+ spec + re-verifying breaks the verdict-matrix
// alignment test in tests/tla-alignment.test.ts.

export const DRIFT_SOURCES = [
  "None",
  "ProviderApiChurn",
  "ConsoleBreakGlass",
  "GenuineIacDrift",
  "Mixed",
  "Unknown",
] as const;

export type DriftSource = (typeof DRIFT_SOURCES)[number];

export type Confidence = "none" | "low" | "medium" | "high";

export interface RemediationHint {
  action: string;
  doc?: string;
}

export interface Evidence {
  adapter: string;
  signalKind: string;
  raw: unknown;
  timestamp: string;
}

export interface DriftVerdict {
  resource: string;
  source: DriftSource;
  confidence: Confidence;
  evidence: Evidence[];
  recommendation?: RemediationHint;
  /**
   * Added in v1.1.0 M4 (Hulumi-for-GitHub). True when the GitHub plan
   * tier (Team / Pro / Free non-GHEC) prevents full audit-log fidelity
   * — the GithubWebhookFallbackAdapter's output is push-model webhook
   * coverage, NOT REST audit-log polling. Distinct from Hulumi's `Tier`
   * enum (`sandbox` / `startup-hardened`). Non-suppressible: there is no
   * API flag to hide this when the underlying adapter signals it.
   */
  tierDegraded?: boolean;
  /**
   * Added in v1.1.0 M4. Listed feature names the underlying GitHub plan
   * does NOT license; the adapter cannot observe drift for those
   * features. Examples: `["code_scanning_alert"]` for repos without GHAS.
   * Non-suppressible.
   */
  featureNotLicensed?: string[];
}

export interface AdapterSignal {
  /** Whether the adapter detected something. False = clean / no signal. */
  detected: boolean;
  /** Adapter-specific extra payload; classifier treats as opaque. */
  data: Record<string, unknown>;
  /** Whether the underlying probe / API call succeeded. False = degraded. */
  ok: boolean;
}

export interface DriftAdapter {
  name(): string;
  available(): Promise<boolean>;
  signal(
    stack: string,
    resource: string,
    window: { before: string; after: string },
  ): Promise<AdapterSignal>;
}

export interface ClassifyOptions {
  window?: { before: string; after: string };
  minConfidence?: Confidence;
  requireAdapters?: string[];
  /** Probe timeout in ms. Default 60_000. */
  probeTimeoutMs?: number;
  /** Cache TTL in seconds. Default 21600 (6h). */
  cacheTtlSeconds?: number;
  /** Cache directory. Default `.hulumi/drift-cache/`. */
  cacheDir?: string;
}

/**
 * Snapshot of all four adapter signals + probe state, fed into
 * hardenedVerdict() to produce a DriftVerdict. Mirror of TLA+ state
 * record per HulumiDrift-verified.md §3.
 */
export interface VerdictSnapshot {
  mutated: boolean;
  eventInTransit: boolean;
  eventDelivered: boolean;
  providerDrift: boolean;
}
