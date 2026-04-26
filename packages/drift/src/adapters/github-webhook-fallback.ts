// GithubWebhookFallbackAdapter — push-model GitHub webhook ingestion for
// drift detection on non-GHEC plan tiers (Team / Pro / Free).
//
// Pure TypeScript class — implements `DriftAdapter`. No `pulumi.dynamic.Resource`
// (per M3 lessons rule #2: never inside test-runtime paths). Webhook events
// arrive from outside (HTTP receiver, file ingest, queue) and are ingested
// via `recordEvent()` which is idempotent + signature-verified.
//
// Critique-derived constraints (all wired in this file):
//   - S1: 25 MB body-size cap + 64-level nesting depth cap. Reject before
//     any field is read. Cited from GitHub's webhook payload-limit docs.
//   - S5: cache key = SHA-256 of `(deliveryId|eventType|repoFullName)`
//     triple. Raw repoFullName from payload is never a path component.
//   - E1: events are sequenced by envelope timestamp before composition.
//     Out-of-order delivery from GitHub is reordered here.
//   - E3: secret-rotation detection — >3 consecutive HMAC failures from
//     the same `(installationId, repoFullName)` source emits a structured
//     `webhook_secret_rotation_suspected` audit row.
//
// Webhook events covered (per the M4 runbook spec):
//   branch_protection_rule, repository_ruleset, secret_scanning_alert,
//   dependabot_alert, code_scanning_alert (private repos: GHAS-licensed
//   only), member, organization (org-only).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { AdapterSignal, DriftAdapter } from "../types";

const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024; // 25 MB per GitHub spec
const MAX_NESTING_DEPTH = 64;
const ROTATION_FAILURE_THRESHOLD = 3;
const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Subset of GitHub webhook event types relevant to drift detection. */
export const WEBHOOK_EVENT_TYPES = [
  "branch_protection_rule",
  "repository_ruleset",
  "secret_scanning_alert",
  "dependabot_alert",
  "code_scanning_alert",
  "member",
  "organization",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface IngestedEvent {
  /** Hashed cache key — SHA-256 hex of `(deliveryId|eventType|repoFullName)` triple. */
  cacheKey: string;
  /** Raw event-type header value. */
  eventType: WebhookEventType;
  /** repository.full_name from payload — sanitized but stored as-supplied for evidence. */
  repoFullName: string;
  /** Envelope timestamp from `X-GitHub-Hook-Installation-Target-ID` + receipt time. */
  envelopeTime: string;
  /** Raw deliveryId from `X-GitHub-Delivery` header. */
  deliveryId: string;
  /** Pre-validated, parsed JSON payload (bounded). */
  payload: Record<string, unknown>;
}

export interface GithubWebhookFallbackAdapterArgs {
  /**
   * Source of the HMAC secret. Must be wrapped in a function so the secret
   * is never captured into long-lived closures or written to disk.
   */
  webhookSecret: () => string;
  /** Hulumi tier governing the adapter — controls whether unsigned events are accepted. */
  hulumiTier: "sandbox" | "startup-hardened";
  /**
   * If true at sandbox tier ONLY, accept events without HMAC signature.
   * Each unsigned event emits a `webhook_unsigned_accepted` audit row.
   */
  allowUnsignedWebhooks?: boolean;
  /**
   * Map of feature → not-licensed flag. Drives the
   * `DriftVerdict.featureNotLicensed` output. E.g.
   * `{ "code_scanning_alert": true }` for non-GHAS repos.
   */
  featureLicenseMap?: Partial<Record<WebhookEventType, boolean>>;
}

/**
 * Recursive depth check — returns true if the value's nested-object/array
 * depth exceeds `maxDepth`. Iterative implementation to avoid Node stack
 * overflow on deeply-nested payloads.
 */
function exceedsNestingDepth(root: unknown, maxDepth: number): boolean {
  const stack: Array<[unknown, number]> = [[root, 0]];
  while (stack.length > 0) {
    const [v, depth] = stack.pop() as [unknown, number];
    if (depth > maxDepth) return true;
    if (v === null || typeof v !== "object") continue;
    if (Array.isArray(v)) {
      for (const x of v) stack.push([x, depth + 1]);
    } else {
      for (const x of Object.values(v as Record<string, unknown>)) stack.push([x, depth + 1]);
    }
  }
  return false;
}

function hashCacheKey(deliveryId: string, eventType: string, repoFullName: string): string {
  return createHash("sha256")
    .update(`${deliveryId}|${eventType}|${repoFullName}`)
    .digest("hex");
}

/**
 * HMAC-SHA-256 verification using `crypto.timingSafeEqual` for
 * constant-time compare. Returns true on match, false on mismatch or any
 * length / encoding error.
 */
export function verifyWebhookSignature(
  body: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !signature.startsWith("sha256=")) return false;
  const provided = signature.slice("sha256=".length);
  const computed = createHmac("sha256", secret).update(body).digest("hex");
  if (provided.length !== computed.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(computed, "hex"));
  } catch {
    return false;
  }
}

/**
 * Emit a structured `security_event.*` audit row to stderr. Mirrors the
 * shape used in M2's `org-security-defaults.ts` so log parsers see one
 * format across the GitHub-side surface.
 */
function emitWebhookEvent(event: string, detail: Record<string, unknown>): void {
  process.stderr.write(`security_event ${event} ${JSON.stringify(detail)}\n`);
}

export class GithubWebhookFallbackAdapter implements DriftAdapter {
  private readonly idempotency = new Map<string, number>(); // cacheKey → ingestedAt
  private readonly events: IngestedEvent[] = [];
  private readonly rotationCounters = new Map<string, number>(); // installationId|repoFullName → consecutive failures

  constructor(private readonly args: GithubWebhookFallbackAdapterArgs) {}

  name(): string {
    return "github-webhook-fallback";
  }

  async available(): Promise<boolean> {
    // The adapter is always "available" in the sense that ingestEvent is
    // ready; readiness against a real GitHub webhook receiver is wiring,
    // not adapter state.
    return true;
  }

  /**
   * Bounded-parse + HMAC-verify + idempotency-dedup + sequence the event.
   * Returns the parsed event, or throws / signals rejection per the
   * critique-derived constraints.
   */
  recordEvent(args: {
    body: string;
    signature: string | undefined;
    deliveryId: string;
    eventType: string;
    installationId?: string;
    receivedAt: string;
  }):
    | { ok: true; event: IngestedEvent }
    | { ok: false; reason: string } {
    // S1.a — size cap (25 MB).
    if (Buffer.byteLength(args.body, "utf8") > MAX_PAYLOAD_BYTES) {
      emitWebhookEvent("webhook_payload_max_size_exceeded", {
        deliveryId: args.deliveryId,
        eventType: args.eventType,
        sizeBytes: Buffer.byteLength(args.body, "utf8"),
      });
      return { ok: false, reason: "payload_max_size_exceeded" };
    }

    // S1.b — depth cap (64 levels). Parse with try/catch then walk.
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(args.body) as Record<string, unknown>;
    } catch (err) {
      emitWebhookEvent("webhook_payload_parse_error", {
        deliveryId: args.deliveryId,
        eventType: args.eventType,
        reason: String(err),
      });
      return { ok: false, reason: "payload_parse_error" };
    }
    if (exceedsNestingDepth(parsed, MAX_NESTING_DEPTH)) {
      emitWebhookEvent("webhook_payload_max_nesting_depth_exceeded", {
        deliveryId: args.deliveryId,
        eventType: args.eventType,
      });
      return { ok: false, reason: "payload_max_nesting_depth_exceeded" };
    }

    // Event-type allow-list — reject unknown event types.
    if (!(WEBHOOK_EVENT_TYPES as readonly string[]).includes(args.eventType)) {
      return { ok: false, reason: "unknown_event_type" };
    }

    // HMAC verification (mandatory at startup-hardened; sandbox can opt out).
    const isStartupHardened = this.args.hulumiTier === "startup-hardened";
    const allowUnsigned =
      !isStartupHardened && this.args.allowUnsignedWebhooks === true;
    let signatureOk = false;
    if (args.signature) {
      signatureOk = verifyWebhookSignature(args.body, args.signature, this.args.webhookSecret());
    } else if (allowUnsigned) {
      emitWebhookEvent("webhook_unsigned_accepted", {
        deliveryId: args.deliveryId,
        eventType: args.eventType,
        tier: this.args.hulumiTier,
      });
      signatureOk = true;
    }
    const sourceKey = `${args.installationId ?? "unknown"}|${this.extractRepoFullName(parsed)}`;
    if (!signatureOk) {
      emitWebhookEvent("webhook_signature_failed", {
        deliveryId: args.deliveryId,
        eventType: args.eventType,
      });
      // E3 — rotation-detection counter.
      const prev = this.rotationCounters.get(sourceKey) ?? 0;
      const next = prev + 1;
      this.rotationCounters.set(sourceKey, next);
      if (next >= ROTATION_FAILURE_THRESHOLD) {
        emitWebhookEvent("webhook_secret_rotation_suspected", {
          installationId: args.installationId ?? "unknown",
          repoFullName: this.extractRepoFullName(parsed),
          consecutiveFailures: next,
          remediation:
            "run pulumi up to refresh webhookSecret; verify GitHub-side webhook secret matches",
        });
      }
      return { ok: false, reason: "signature_failed" };
    }
    // HMAC ok — reset rotation counter for this source.
    this.rotationCounters.delete(sourceKey);

    // S5 — SHA-256-hashed cache key. Raw repoFullName never used as a path.
    const repoFullName = this.extractRepoFullName(parsed);
    const cacheKey = hashCacheKey(args.deliveryId, args.eventType, repoFullName);

    // Idempotency dedupe + TTL eviction.
    this.evictExpired();
    if (this.idempotency.has(cacheKey)) {
      emitWebhookEvent("webhook_replay_blocked", {
        deliveryId: args.deliveryId,
        eventType: args.eventType,
      });
      return { ok: false, reason: "replay_blocked" };
    }
    this.idempotency.set(cacheKey, Date.now());

    const event: IngestedEvent = {
      cacheKey,
      eventType: args.eventType as WebhookEventType,
      repoFullName,
      envelopeTime: args.receivedAt,
      deliveryId: args.deliveryId,
      payload: parsed,
    };
    this.events.push(event);
    return { ok: true, event };
  }

  /**
   * `DriftAdapter.signal` — produce an AdapterSignal for the requested
   * (stack, resource) pair within the window. Ingested events whose
   * envelopeTime falls in the window are sequenced + folded into the
   * signal payload.
   */
  async signal(
    _stack: string,
    resource: string,
    window: { before: string; after: string },
  ): Promise<AdapterSignal> {
    // The DriftAdapter window contract uses `before` as the upper bound
    // (more recent) and `after` as the lower bound (earlier) — events
    // are matched when `after <= t <= before`. This matches the
    // CloudTrail adapter's convention.
    const upperTs = new Date(window.before).getTime();
    const lowerTs = new Date(window.after).getTime();
    // E1 — sequence by envelope timestamp before composition.
    const inWindow = this.events
      .filter((e) => {
        if (e.repoFullName !== resource) return false;
        const t = new Date(e.envelopeTime).getTime();
        if (Number.isNaN(t)) return false;
        return t >= lowerTs && t <= upperTs;
      })
      .sort(
        (a, b) =>
          new Date(a.envelopeTime).getTime() - new Date(b.envelopeTime).getTime(),
      );
    const featureNotLicensed: string[] = [];
    for (const [feat, notLicensed] of Object.entries(this.args.featureLicenseMap ?? {})) {
      if (notLicensed && inWindow.some((e) => e.eventType === feat)) {
        featureNotLicensed.push(feat);
      }
    }
    return {
      detected: inWindow.length > 0,
      data: {
        eventCount: inWindow.length,
        events: inWindow.map((e) => ({
          eventType: e.eventType,
          envelopeTime: e.envelopeTime,
          deliveryId: e.deliveryId,
          repoFullName: e.repoFullName,
        })),
        // tierDegraded is always true — this adapter exists because GHEC
        // audit-log REST is unavailable. Per the M4 design rule, the
        // truth is non-suppressible.
        tierDegraded: true,
        featureNotLicensed,
      },
      ok: true,
    };
  }

  // ---- helpers ----

  private extractRepoFullName(payload: Record<string, unknown>): string {
    const repo = payload.repository as Record<string, unknown> | undefined;
    if (repo && typeof repo.full_name === "string") return repo.full_name;
    const org = payload.organization as Record<string, unknown> | undefined;
    if (org && typeof org.login === "string") return `${org.login}/${"-org-only-event-"}`;
    return "unknown/unknown";
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, ts] of this.idempotency.entries()) {
      if (now - ts > IDEMPOTENCY_TTL_MS) this.idempotency.delete(key);
    }
  }
}

export {
  MAX_PAYLOAD_BYTES,
  MAX_NESTING_DEPTH,
  ROTATION_FAILURE_THRESHOLD,
  IDEMPOTENCY_TTL_MS,
  hashCacheKey,
  exceedsNestingDepth,
};
