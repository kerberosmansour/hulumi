// CloudTrail delivery-probe wrapper. The real probe writes a sentinel
// event tagged `hulumi:probe-sentinel=true` and polls
// CloudTrailLookupEvents until either the event surfaces or the
// timeout fires. Wrapped in p-timeout + AbortSignal — no setTimeout /
// sleep in component-composition source.
//
// On timeout, the classifier degrades to Unknown / low with evidence
// `probeFailedAt` populated (E1).

import pTimeout from "p-timeout";

export interface ProbeResult {
  ok: boolean;
  eventDelivered: boolean;
  eventInTransit: boolean;
  /** ISO8601 timestamp at which the probe gave up. Only set when ok=false. */
  probeFailedAt?: string;
  message?: string;
}

export interface ProbeFn {
  (signal: AbortSignal): Promise<{ delivered: boolean; inTransit: boolean }>;
}

export interface RunProbeArgs {
  probe: ProbeFn;
  timeoutMs: number;
}

export async function runProbe(args: RunProbeArgs): Promise<ProbeResult> {
  const controller = new AbortController();
  try {
    const inner = args.probe(controller.signal);
    const result = await pTimeout(inner, {
      milliseconds: args.timeoutMs,
      message: `CloudTrail delivery probe timed out after ${args.timeoutMs}ms`,
    });
    return {
      ok: true,
      eventDelivered: result.delivered,
      eventInTransit: result.inTransit,
    };
  } catch (err) {
    controller.abort();
    return {
      ok: false,
      eventDelivered: false,
      eventInTransit: false,
      probeFailedAt: new Date().toISOString(),
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
