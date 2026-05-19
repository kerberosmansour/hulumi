// DriftClassifier — orchestrates the 4 adapters in parallel via
// Promise.allSettled, builds a VerdictSnapshot, calls hardenedVerdict,
// applies the Monotonicity guard, and writes through to the on-disk
// cache (mode 0600).
//
// Cache-first path: within TTL, classify() short-circuits to the
// cached verdict and adapters are NOT re-invoked (S7 rate-limit).

import type {
  AdapterSignal,
  Confidence,
  ClassifyOptions,
  DriftAdapter,
  DriftSource,
  DriftVerdict,
  Evidence,
  VerdictSnapshot,
} from "./types";
import { hardenedVerdict } from "./verdict";
import { checkMonotonicity } from "./monotonicity";
import {
  CACHE_SCHEMA_VERSION,
  cachePathFor,
  readCache,
  writeCache,
  type CacheEnvelope,
} from "./cache";
import { runProbe, type ProbeFn } from "./probe";

export interface DriftClassifierArgs {
  adapters: {
    automationApi: DriftAdapter;
    cloudTrail: DriftAdapter;
    providerVersion: DriftAdapter;
    gitLog: DriftAdapter;
  };
  /** CloudTrail delivery probe — wraps the lookup-with-sentinel logic. */
  probe: ProbeFn;
  /** AWS region used to select the default CloudTrail probe timeout. */
  awsRegion?: string;
}

export const DEFAULT_PROBE_TIMEOUT_MS = 60_000;

export const REGION_PROBE_TIMEOUT_MS: Readonly<Record<string, number>> = {
  "us-east-1": 60_000,
  "us-east-2": 60_000,
  "us-west-1": 60_000,
  "us-west-2": 60_000,
  "eu-west-1": 60_000,
  "eu-west-2": 60_000,
  "eu-central-1": 60_000,
  "ap-southeast-1": 90_000,
  "ap-southeast-2": 90_000,
  "ap-southeast-3": 120_000,
} as const;

export interface ResolveProbeTimeoutArgs {
  probeTimeoutMs?: number;
  optionRegion?: string;
  classifierRegion?: string;
  env?: Record<string, string | undefined>;
}

export function resolveProbeTimeoutMs(args: ResolveProbeTimeoutArgs): number {
  if (args.probeTimeoutMs !== undefined) return args.probeTimeoutMs;
  const env = args.env ?? process.env;
  const region = firstNonBlank(
    args.optionRegion,
    args.classifierRegion,
    env.AWS_REGION,
    env.AWS_DEFAULT_REGION,
  );
  if (region === undefined) return DEFAULT_PROBE_TIMEOUT_MS;
  return REGION_PROBE_TIMEOUT_MS[region] ?? DEFAULT_PROBE_TIMEOUT_MS;
}

export class DriftClassifier {
  constructor(private readonly args: DriftClassifierArgs) {}

  /**
   * Per-resource classification. The resource argument is a Pulumi URN
   * (or stack-relative resource identifier). The first call within TTL
   * runs every adapter and writes the cache; subsequent calls inside
   * the TTL window short-circuit to the cached verdict.
   */
  async classify(
    stack: string,
    resource: string,
    options: ClassifyOptions = {},
  ): Promise<DriftVerdict> {
    const cacheDir = options.cacheDir ?? ".hulumi/drift-cache";
    const ttl = options.cacheTtlSeconds ?? 21_600;
    const probeTimeoutMs = resolveProbeTimeoutMs({
      ...(options.probeTimeoutMs !== undefined ? { probeTimeoutMs: options.probeTimeoutMs } : {}),
      ...(options.awsRegion !== undefined ? { optionRegion: options.awsRegion } : {}),
      ...(this.args.awsRegion !== undefined ? { classifierRegion: this.args.awsRegion } : {}),
    });
    const cachePath = cachePathFor(cacheDir, stack, resource);

    const cached = await readCache(cachePath, ttl);
    if (cached.envelope !== undefined) {
      return cached.envelope.verdict;
    }

    const evidence: Evidence[] = [];
    const ts = new Date().toISOString();

    if (cached.absenceReason && cached.absenceReason !== "missing") {
      evidence.push({
        adapter: "Cache",
        signalKind: cached.absenceReason,
        raw: {},
        timestamp: ts,
      });
    }

    const window = options.window ?? {
      before: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      after: new Date().toISOString(),
    };

    const [autoResult, ctResult, pvResult, glResult] = await Promise.allSettled([
      this.args.adapters.automationApi.signal(stack, resource, window),
      this.args.adapters.cloudTrail.signal(stack, resource, window),
      this.args.adapters.providerVersion.signal(stack, resource, window),
      this.args.adapters.gitLog.signal(stack, resource, window),
    ]);

    const auto = unwrapSignal(autoResult, "AutomationApi");
    const ct = unwrapSignal(ctResult, "CloudTrail");
    const pv = unwrapSignal(pvResult, "ProviderVersion");
    const gl = unwrapSignal(glResult, "GitLog");

    pushEvidence(evidence, "AutomationApi", auto);
    pushEvidence(evidence, "CloudTrail", ct);
    pushEvidence(evidence, "ProviderVersion", pv);
    pushEvidence(evidence, "GitLog", gl);

    const probeResult = await runProbe({
      probe: this.args.probe,
      timeoutMs: probeTimeoutMs,
    });
    if (!probeResult.ok) {
      evidence.push({
        adapter: "Probe",
        signalKind: "probeFailedAt",
        raw: { failedAt: probeResult.probeFailedAt, message: probeResult.message },
        timestamp: ts,
      });
    }

    const snapshot: VerdictSnapshot = {
      mutated: auto.detected,
      eventInTransit: probeResult.ok && probeResult.eventInTransit,
      eventDelivered: probeResult.ok && probeResult.eventDelivered,
      providerDrift: pv.detected,
    };

    // FAIL-CLOSED GATE (M-ADAPTERFAIL). A rejected / failed required
    // adapter unwraps to {detected:false, ok:false}. Trusting only
    // `detected` would treat that as "clean" (mutated=false) and emit
    // None/none, which would then be cached and short-circuit every
    // subsequent call inside the TTL — a fail-open. The Automation-API
    // (`auto`) and provider-version (`pv`) adapters are required inputs
    // to the matrix (`mutated` / `providerDrift`); if either failed we
    // cannot trust the snapshot, so degrade to the SAME verdict the
    // probe-failure path (E1) produces — Unknown / low — and DO NOT
    // write that degraded result to the cache.
    const requiredAdapterFailed = !auto.ok || !pv.ok;
    if (requiredAdapterFailed) {
      const degradedVerdict: DriftVerdict = {
        resource,
        source: "Unknown",
        confidence: "low",
        evidence,
        ...(buildRecommendation("Unknown") !== undefined
          ? { recommendation: buildRecommendation("Unknown")! }
          : {}),
      };
      // Same effect as the meetsMinConfidence early-return below: return
      // without writing the cache so a degraded run never becomes the
      // cached canonical entry and never short-circuits later calls.
      return degradedVerdict;
    }

    let { source, confidence } = hardenedVerdict(snapshot);
    if (
      !probeResult.ok &&
      snapshot.mutated &&
      !snapshot.eventDelivered &&
      !snapshot.providerDrift
    ) {
      // Probe failure → degrade to Unknown/low (E1). hardenedVerdict
      // already returns Unknown/low for this branch; explicit comment
      // for the maintainer.
    }

    // Mixed / ConsoleBreakGlass escalation is driven by REAL CloudTrail
    // audit evidence (`ct.detected`), NOT by probe liveness alone
    // (M-MIXED). hardenedVerdict() may return Mixed / ConsoleBreakGlass
    // purely from `snapshot.eventDelivered` (a healthy in-flight probe
    // sentinel) — but a live probe is not proof a console event actually
    // occurred. The `!snapshot.eventDelivered` guard that used to wrap
    // this block has been removed so the ct.detected-based correction
    // ALSO runs when the probe is healthy.
    if (snapshot.mutated && ct.detected) {
      // Real console event observed in CloudTrail → escalate. This also
      // covers the long-window lookup case where the probe was
      // unavailable but events surfaced.
      source = snapshot.providerDrift ? "Mixed" : "ConsoleBreakGlass";
      confidence = "high";
    } else if ((source === "Mixed" || source === "ConsoleBreakGlass") && !ct.detected) {
      // hardenedVerdict escalated to Mixed / ConsoleBreakGlass from
      // probe liveness alone, but CloudTrail did NOT actually observe a
      // console event. Demote to the appropriate non-escalated verdict:
      // mutated + providerDrift → ProviderApiChurn / medium (matrix
      // row 4 semantics); otherwise → Unknown / low (matrix row 5).
      if (snapshot.providerDrift) {
        source = "ProviderApiChurn";
        confidence = "medium";
      } else {
        source = "Unknown";
        confidence = "low";
      }
    }

    if (snapshot.mutated && gl.detected && source === "Unknown") {
      source = "GenuineIacDrift";
      confidence = "medium";
    }

    const verdict: DriftVerdict = {
      resource,
      source,
      confidence,
      evidence,
      ...(buildRecommendation(source) !== undefined
        ? { recommendation: buildRecommendation(source)! }
        : {}),
    };

    if (!meetsMinConfidence(confidence, options.minConfidence)) {
      // Below caller's threshold — return without writing cache (avoid
      // a low-confidence write becoming the cached canonical entry).
      return verdict;
    }

    const existingEnvelope = await readCacheEnvelopeIgnoreTtl(cachePath);
    const monoResult = checkMonotonicity(existingEnvelope?.verdict, verdict);
    if (monoResult.allowWrite) {
      const envelope: CacheEnvelope = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        writtenAt: ts,
        verdict,
      };
      await writeCache(cachePath, envelope);
    }
    return verdict;
  }
}

function unwrapSignal(result: PromiseSettledResult<AdapterSignal>, adapter: string): AdapterSignal {
  if (result.status === "fulfilled") return result.value;
  return {
    detected: false,
    ok: false,
    data: { error: `Adapter ${adapter} rejected: ${result.reason}` },
  };
}

function pushEvidence(out: Evidence[], adapter: string, signal: AdapterSignal): void {
  out.push({
    adapter,
    signalKind: signal.detected ? "detected" : signal.ok ? "clean" : "degraded",
    raw: signal.data,
    timestamp: new Date().toISOString(),
  });
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function meetsMinConfidence(actual: Confidence, threshold: Confidence | undefined): boolean {
  // Hardened default (M-ADAPTERFAIL): a `confidence:"none"` only ever
  // accompanies a None verdict or a degraded run. Even when the caller
  // sets no explicit threshold, never let a `none`-confidence verdict
  // become the cached canonical entry (it would short-circuit every
  // subsequent call inside the TTL — a fail-open). All real verdicts
  // carry low/medium/high.
  if (CONFIDENCE_RANK[actual] <= CONFIDENCE_RANK.none) return false;
  if (!threshold) return true;
  return CONFIDENCE_RANK[actual] >= CONFIDENCE_RANK[threshold];
}

function buildRecommendation(source: DriftSource): { action: string; doc?: string } | undefined {
  switch (source) {
    case "ConsoleBreakGlass":
      return {
        action:
          "Investigate the console mutation. Confirm intent; if intentional, codify in IaC and re-apply.",
        doc: "https://github.com/kerberosmansour/hulumi/blob/main/docs/components/drift-classifier.md#console-break-glass",
      };
    case "ProviderApiChurn":
      return {
        action: "Re-pin @pulumi/aws after cooling-off (M5 contract: 72h minor/major, 24h patch).",
        doc: "https://github.com/kerberosmansour/hulumi/blob/main/SECURITY.md#pulumi-cooling-off",
      };
    case "GenuineIacDrift":
      return {
        action: "Run `pulumi up` to apply the local IaC changes.",
      };
    case "Mixed":
      return {
        action:
          "Multiple drift sources detected. Inspect evidence; resolve console mutations first.",
      };
    case "Unknown":
      return {
        action: "Re-run with --min-confidence=low after probe / shallow-clone issue is resolved.",
      };
    default:
      return undefined;
  }
}

async function readCacheEnvelopeIgnoreTtl(path: string): Promise<CacheEnvelope | undefined> {
  // Read regardless of TTL so monotonicity sees prior verdicts even
  // after they've expired. The classifier's primary cache hit path
  // already gated on TTL above; this is monotonicity-only.
  const r = await readCache(path, Number.MAX_SAFE_INTEGER);
  return r.envelope;
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed !== undefined && trimmed.length > 0) return trimmed;
  }
  return undefined;
}
