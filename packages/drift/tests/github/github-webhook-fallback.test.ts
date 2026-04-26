// BDD scenarios for GithubWebhookFallbackAdapter. Each describe block
// covers one critique-derived invariant from the M4 runbook + the M3
// lessons file's rules-for-next-milestone.

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

import {
  GithubWebhookFallbackAdapter,
  hashCacheKey,
  exceedsNestingDepth,
  verifyWebhookSignature,
  MAX_PAYLOAD_BYTES,
  MAX_NESTING_DEPTH,
  ROTATION_FAILURE_THRESHOLD,
} from "../../src/adapters/github-webhook-fallback";

const SECRET = "test-secret-do-not-use";

function signed(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function makeAdapter(args?: {
  hulumiTier?: "sandbox" | "startup-hardened";
  allowUnsignedWebhooks?: boolean;
  featureLicenseMap?: Record<string, boolean>;
}): GithubWebhookFallbackAdapter {
  return new GithubWebhookFallbackAdapter({
    webhookSecret: () => SECRET,
    hulumiTier: args?.hulumiTier ?? "startup-hardened",
    ...(args?.allowUnsignedWebhooks !== undefined
      ? { allowUnsignedWebhooks: args.allowUnsignedWebhooks }
      : {}),
    ...(args?.featureLicenseMap ? { featureLicenseMap: args.featureLicenseMap } : {}),
  });
}

describe("GithubWebhookFallbackAdapter — happy path (signed events)", () => {
  it("ingests a valid signed branch_protection_rule event", () => {
    const adapter = makeAdapter();
    const body = JSON.stringify({
      action: "deleted",
      rule: { name: "main" },
      repository: { full_name: "myorg/repo" },
    });
    const result = adapter.recordEvent({
      body,
      signature: signed(body),
      deliveryId: "delivery-1",
      eventType: "branch_protection_rule",
      installationId: "inst-1",
      receivedAt: "2026-04-26T12:00:00Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.repoFullName).toBe("myorg/repo");
      expect(result.event.eventType).toBe("branch_protection_rule");
    }
  });
});

describe("GithubWebhookFallbackAdapter — abuse case S1: payload size + depth bounds (per critique S1)", () => {
  it("rejects payload exceeding 25 MB", () => {
    const adapter = makeAdapter();
    // Construct a body whose UTF-8 byte length is just over 25 MB.
    const padding = "x".repeat(MAX_PAYLOAD_BYTES + 1024);
    const body = JSON.stringify({ filler: padding });
    const result = adapter.recordEvent({
      body,
      signature: signed(body),
      deliveryId: "delivery-bigpayload",
      eventType: "branch_protection_rule",
      receivedAt: "2026-04-26T12:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("payload_max_size_exceeded");
  });

  it("rejects deeply-nested payload exceeding 64 levels", () => {
    const adapter = makeAdapter();
    // Build a JSON object 100 levels deep.
    let nested: Record<string, unknown> = { leaf: true };
    for (let i = 0; i < 100; i++) {
      nested = { a: nested };
    }
    const body = JSON.stringify({ payload: nested, repository: { full_name: "myorg/repo" } });
    const result = adapter.recordEvent({
      body,
      signature: signed(body),
      deliveryId: "delivery-deepnest",
      eventType: "branch_protection_rule",
      receivedAt: "2026-04-26T12:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("payload_max_nesting_depth_exceeded");
  });

  it("exceedsNestingDepth utility correctly flags depth > MAX_NESTING_DEPTH", () => {
    let v: unknown = "leaf";
    for (let i = 0; i < MAX_NESTING_DEPTH + 5; i++) v = { x: v };
    expect(exceedsNestingDepth(v, MAX_NESTING_DEPTH)).toBe(true);
    expect(exceedsNestingDepth({ a: { b: { c: "ok" } } }, MAX_NESTING_DEPTH)).toBe(false);
  });
});

describe("GithubWebhookFallbackAdapter — abuse case S5: SHA-256 cache key (no path traversal)", () => {
  it("hashCacheKey produces 64-char hex regardless of input shape", () => {
    const safe = hashCacheKey("delivery-1", "branch_protection_rule", "myorg/repo");
    expect(safe).toMatch(/^[0-9a-f]{64}$/);
    // Inputs containing path-traversal sequences produce normal-looking
    // hashes — they cannot land on disk as a filename containing `..`.
    const traversalAttempt = hashCacheKey(
      "delivery-1",
      "branch_protection_rule",
      "../../../etc/passwd",
    );
    expect(traversalAttempt).toMatch(/^[0-9a-f]{64}$/);
    expect(traversalAttempt).not.toContain("..");
    expect(traversalAttempt).not.toContain("/");
  });
});

describe("GithubWebhookFallbackAdapter — abuse case: signature tampering rejected (S2-equivalent for HMAC)", () => {
  it("rejects event with tampered signature (constant-time-compare)", () => {
    const adapter = makeAdapter();
    const body = JSON.stringify({
      action: "edited",
      repository: { full_name: "myorg/repo" },
    });
    // Sign with the wrong secret.
    const result = adapter.recordEvent({
      body,
      signature: signed(body, "wrong-secret"),
      deliveryId: "delivery-tampered",
      eventType: "branch_protection_rule",
      installationId: "inst-1",
      receivedAt: "2026-04-26T12:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("signature_failed");
  });

  it("verifyWebhookSignature returns false on length mismatch (no timingSafeEqual throw)", () => {
    expect(verifyWebhookSignature("body", "sha256=tooshort", SECRET)).toBe(false);
    expect(verifyWebhookSignature("body", undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature("body", "wrongprefix=abc", SECRET)).toBe(false);
  });

  it("at sandbox tier with allowUnsignedWebhooks, accepts unsigned events", () => {
    const adapter = makeAdapter({ hulumiTier: "sandbox", allowUnsignedWebhooks: true });
    const body = JSON.stringify({
      repository: { full_name: "myorg/sandbox-repo" },
    });
    const result = adapter.recordEvent({
      body,
      signature: undefined,
      deliveryId: "delivery-unsigned",
      eventType: "branch_protection_rule",
      receivedAt: "2026-04-26T12:00:00Z",
    });
    expect(result.ok).toBe(true);
  });
});

describe("GithubWebhookFallbackAdapter — abuse case: webhook replay blocked (idempotency cache)", () => {
  it("second ingestion of identical (deliveryId, eventType, repoFullName) is rejected", () => {
    const adapter = makeAdapter();
    const body = JSON.stringify({
      repository: { full_name: "myorg/repo" },
    });
    const sig = signed(body);
    const r1 = adapter.recordEvent({
      body,
      signature: sig,
      deliveryId: "delivery-replay",
      eventType: "branch_protection_rule",
      receivedAt: "2026-04-26T12:00:00Z",
    });
    expect(r1.ok).toBe(true);
    const r2 = adapter.recordEvent({
      body,
      signature: sig,
      deliveryId: "delivery-replay",
      eventType: "branch_protection_rule",
      receivedAt: "2026-04-26T12:00:01Z",
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe("replay_blocked");
  });
});

describe("GithubWebhookFallbackAdapter — abuse case E3: secret-rotation detection", () => {
  it(`emits webhook_secret_rotation_suspected after ${ROTATION_FAILURE_THRESHOLD} consecutive HMAC failures from same source`, () => {
    const adapter = makeAdapter();
    const body = JSON.stringify({ repository: { full_name: "myorg/repo" } });
    const stderrLines: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      stderrLines.push(s);
      return true;
    }) as typeof process.stderr.write;
    try {
      // Three consecutive bad signatures from the same source.
      for (let i = 0; i < ROTATION_FAILURE_THRESHOLD; i++) {
        adapter.recordEvent({
          body,
          signature: signed(body, "wrong-secret"),
          deliveryId: `delivery-rotate-${i}`,
          eventType: "branch_protection_rule",
          installationId: "inst-rotation",
          receivedAt: `2026-04-26T12:00:0${i}Z`,
        });
      }
    } finally {
      process.stderr.write = originalWrite;
    }
    const rotation = stderrLines.find((l) => l.includes("webhook_secret_rotation_suspected"));
    expect(rotation).toBeDefined();
    expect(rotation!).toContain("inst-rotation");
    expect(rotation!).toContain("myorg/repo");
  });
});

describe("GithubWebhookFallbackAdapter — abuse case E1: out-of-order delivery sequenced before composition", () => {
  it("signal output sorts in-window events by envelopeTime regardless of ingestion order", async () => {
    const adapter = makeAdapter();
    const body1 = JSON.stringify({
      action: "deleted",
      repository: { full_name: "myorg/repo" },
    });
    const body2 = JSON.stringify({
      action: "created",
      repository: { full_name: "myorg/repo" },
    });
    // Ingest the LATER event first (out-of-order), then the earlier one.
    adapter.recordEvent({
      body: body1,
      signature: signed(body1),
      deliveryId: "ev-later",
      eventType: "branch_protection_rule",
      receivedAt: "2026-04-26T12:00:05Z",
    });
    adapter.recordEvent({
      body: body2,
      signature: signed(body2),
      deliveryId: "ev-earlier",
      eventType: "branch_protection_rule",
      receivedAt: "2026-04-26T11:59:55Z",
    });
    const sig = await adapter.signal("stack", "myorg/repo", {
      before: "2026-04-26T12:00:10Z",
      after: "2026-04-26T11:59:00Z",
    });
    expect(sig.detected).toBe(true);
    const events = sig.data.events as Array<{ deliveryId: string; envelopeTime: string }>;
    expect(events.length).toBe(2);
    // Sorted ascending by envelopeTime.
    expect(events[0].deliveryId).toBe("ev-earlier");
    expect(events[1].deliveryId).toBe("ev-later");
  });
});

describe("GithubWebhookFallbackAdapter — non-suppressible tierDegraded + featureNotLicensed", () => {
  it("signal output always carries tierDegraded: true (non-suppressible)", async () => {
    const adapter = makeAdapter();
    const body = JSON.stringify({ repository: { full_name: "myorg/repo" } });
    adapter.recordEvent({
      body,
      signature: signed(body),
      deliveryId: "delivery-tier",
      eventType: "branch_protection_rule",
      receivedAt: "2026-04-26T12:00:00Z",
    });
    const sig = await adapter.signal("stack", "myorg/repo", {
      before: "2026-04-26T12:30:00Z",
      after: "2026-04-26T11:30:00Z",
    });
    expect(sig.data.tierDegraded).toBe(true);
  });

  it("featureNotLicensed lists features whose license map says not-licensed AND were observed", async () => {
    const adapter = makeAdapter({
      featureLicenseMap: { code_scanning_alert: true, secret_scanning_alert: false },
    });
    const body = JSON.stringify({
      repository: { full_name: "myorg/private-repo", private: true },
    });
    adapter.recordEvent({
      body,
      signature: signed(body),
      deliveryId: "delivery-feat",
      eventType: "code_scanning_alert",
      receivedAt: "2026-04-26T12:00:00Z",
    });
    const sig = await adapter.signal("stack", "myorg/private-repo", {
      before: "2026-04-26T12:30:00Z",
      after: "2026-04-26T11:30:00Z",
    });
    expect(sig.data.featureNotLicensed).toContain("code_scanning_alert");
    expect(sig.data.featureNotLicensed).not.toContain("secret_scanning_alert");
  });
});

describe("GithubWebhookFallbackAdapter — unknown event type rejected", () => {
  it("rejects events with event-type not in the documented allow-list", () => {
    const adapter = makeAdapter();
    const body = JSON.stringify({ repository: { full_name: "myorg/repo" } });
    const result = adapter.recordEvent({
      body,
      signature: signed(body),
      deliveryId: "delivery-unknown",
      eventType: "ping", // valid GitHub event but not relevant to drift
      receivedAt: "2026-04-26T12:00:00Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unknown_event_type");
  });
});
