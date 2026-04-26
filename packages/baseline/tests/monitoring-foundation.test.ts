// MonitoringFoundation BDD tests — emits 4 SNS topics + per-severity
// subscriptions when provided.

import { describe, it, expect, beforeEach } from "vitest";

import { MonitoringFoundation } from "../src/aws/monitoring-foundation";
import { registrations, resetRegistrations, valueOf, settlePulumi } from "./setup";

describe("MonitoringFoundation — sandbox tier", () => {
  beforeEach(resetRegistrations);

  it("emits exactly 4 SNS topics (one per severity)", async () => {
    const m = new MonitoringFoundation("mon", { tier: "sandbox" });
    await valueOf(m.criticalArn);
    await settlePulumi();

    const topics = registrations.filter((r) => r.type === "aws:sns/topic:Topic");
    expect(topics).toHaveLength(4);

    const names = topics.map((t) => t.inputs.name as string).sort();
    expect(names).toEqual([
      "mon-alerts-critical",
      "mon-alerts-high",
      "mon-alerts-low",
      "mon-alerts-medium",
    ]);
  });

  it("tags topics with hulumi:component=MonitoringFoundation and per-severity Severity tag", async () => {
    const m = new MonitoringFoundation("mon", { tier: "sandbox" });
    await valueOf(m.criticalArn);
    await settlePulumi();

    const critical = registrations.find(
      (r) => r.type === "aws:sns/topic:Topic" && r.inputs.name === "mon-alerts-critical",
    );
    expect(critical).toBeDefined();
    const tags = critical!.inputs.tags as Record<string, string>;
    expect(tags["hulumi:component"]).toBe("MonitoringFoundation");
    expect(tags["hulumi:tier"]).toBe("sandbox");
    expect(tags["Severity"]).toBe("critical");
    // Verify the controls tag uses `+` not `,` (matches AccountFoundation/SecureBucket convention).
    expect(tags["hulumi:controls"]).toMatch(/^[\w:.\-+]+$/);
    expect(tags["hulumi:controls"]).not.toContain(",");
  });

  it("emits zero subscriptions when none provided", async () => {
    const m = new MonitoringFoundation("mon", { tier: "sandbox" });
    await valueOf(m.criticalArn);
    await settlePulumi();

    const subs = registrations.filter(
      (r) => r.type === "aws:sns/topicSubscription:TopicSubscription",
    );
    expect(subs).toHaveLength(0);
  });

  it("emits subscriptions matching provided endpoints", async () => {
    const m = new MonitoringFoundation("mon", {
      tier: "sandbox",
      subscriptions: {
        critical: [
          { protocol: "email", endpoint: "ops@example.com" },
          { protocol: "https", endpoint: "https://hooks.example.com/critical" },
        ],
        high: [{ protocol: "email", endpoint: "ops@example.com" }],
      },
    });
    await valueOf(m.criticalArn);
    await settlePulumi();

    const subs = registrations.filter(
      (r) => r.type === "aws:sns/topicSubscription:TopicSubscription",
    );
    expect(subs).toHaveLength(3);

    const critEmail = subs.find(
      (s) => s.inputs.protocol === "email" && s.inputs.endpoint === "ops@example.com",
    );
    expect(critEmail).toBeDefined();

    const critHttps = subs.find(
      (s) =>
        s.inputs.protocol === "https" &&
        s.inputs.endpoint === "https://hooks.example.com/critical",
    );
    expect(critHttps).toBeDefined();
  });

  it("uses kmsKeyArn when provided", async () => {
    const m = new MonitoringFoundation("mon", {
      tier: "sandbox",
      kmsKeyArn: "arn:aws:kms:eu-west-2:111122223333:key/abc",
    });
    await valueOf(m.criticalArn);
    await settlePulumi();

    const topic = registrations.find((r) => r.type === "aws:sns/topic:Topic");
    expect(topic).toBeDefined();
    expect(topic!.inputs.kmsMasterKeyId).toBe("arn:aws:kms:eu-west-2:111122223333:key/abc");
  });

  it("topicsBySeverity exposes all 4 ARN outputs", async () => {
    const m = new MonitoringFoundation("mon", { tier: "sandbox" });
    expect(Object.keys(m.topicsBySeverity).sort()).toEqual([
      "critical",
      "high",
      "low",
      "medium",
    ]);
    // Drain pending registrations so the next test's beforeEach reset is clean.
    await valueOf(m.criticalArn);
    await settlePulumi();
  });
});

describe("MonitoringFoundation — startup-hardened tier", () => {
  beforeEach(resetRegistrations);

  it("emits same topology as sandbox today (no per-tier delta yet)", async () => {
    const m = new MonitoringFoundation("mon", { tier: "startup-hardened" });
    await valueOf(m.criticalArn);
    await settlePulumi();

    const topics = registrations.filter((r) => r.type === "aws:sns/topic:Topic");
    expect(topics).toHaveLength(4);

    // Tier tag flows through.
    const tags = topics[0].inputs.tags as Record<string, string>;
    expect(tags["hulumi:tier"]).toBe("startup-hardened");
  });
});

describe("MonitoringFoundation — invalid tier", () => {
  beforeEach(resetRegistrations);

  it("throws on unknown tier", () => {
    expect(
      // @ts-expect-error — intentionally invalid
      () => new MonitoringFoundation("mon", { tier: "yolo" }),
    ).toThrow(/tier/i);
  });
});
