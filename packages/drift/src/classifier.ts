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
    const probeTimeoutMs = options.probeTimeoutMs ?? 60_000;
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

    // CloudTrail console events promote the verdict directly when the
    // probe is unavailable but events surfaced via the long-window
    // lookup. (Tracked separately from the in-flight probe sentinel.)
    if (snapshot.mutated && ct.detected && !snapshot.eventDelivered) {
      source = snapshot.providerDrift ? "Mixed" : "ConsoleBreakGlass";
      confidence = "high";
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
