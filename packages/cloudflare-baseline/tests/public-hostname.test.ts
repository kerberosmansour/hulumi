import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicHostname } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

function dnsRecordInputs(): Record<string, unknown> {
  const record = registrations.find((r) => r.type === "cloudflare:index/dnsRecord:DnsRecord");
  if (record === undefined) {
    throw new Error("expected DnsRecord registration");
  }
  return record.inputs;
}

describe("PublicHostname", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetRegistrations();
  });

  it("defaults public application A records to proxied mode", async () => {
    const host = new PublicHostname("app", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      hostname: "app.example.com",
      recordType: "A",
      target: "203.0.113.10",
      purpose: "public-app",
    });

    await settlePulumi();

    expect(dnsRecordInputs()).toMatchObject({
      name: "app.example.com",
      type: "A",
      content: "203.0.113.10",
      proxied: true,
    });
    await expect(valueOf(host.protectionMode)).resolves.toBe("proxied");
  });

  it("rejects DNS-only public application records without acknowledgement", () => {
    expect(
      () =>
        new PublicHostname("dns-only-app", {
          tier: "startup-hardened",
          zoneId: "zone_123",
          hostname: "app.example.com",
          recordType: "A",
          target: "203.0.113.10",
          purpose: "public-app",
          proxied: false,
        }),
    ).toThrow(/acknowledgeDnsOnlyExposure.*dnsOnlyJustification/);
  });

  it("allows acknowledged DNS-only public application records and emits a security event", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const host = new PublicHostname("ack-app", {
      tier: "sandbox",
      zoneId: "zone_123",
      hostname: "legacy.example.com",
      recordType: "A",
      target: "203.0.113.20",
      purpose: "public-app",
      proxied: false,
      acknowledgeDnsOnlyExposure: true,
      dnsOnlyJustification: "legacy migration window with separate origin controls",
    });

    await settlePulumi();

    expect(dnsRecordInputs()).toMatchObject({
      name: "legacy.example.com",
      type: "A",
      proxied: false,
    });
    expect(stderr).toHaveBeenCalledWith(
      expect.stringContaining("dns_only_public_app_acknowledged"),
    );
    await expect(valueOf(host.dnsOnlyJustification)).resolves.toBe(
      "legacy migration window with separate origin controls",
    );
  });

  it("does not claim proxy protection for non-proxy-eligible DNS records", async () => {
    const txt = new PublicHostname("txt", {
      tier: "sandbox",
      zoneId: "zone_123",
      hostname: "example.com",
      recordType: "TXT",
      target: "v=spf1 -all",
      purpose: "dns",
    });

    await settlePulumi();

    expect(dnsRecordInputs()).toMatchObject({
      name: "example.com",
      type: "TXT",
      content: "v=spf1 -all",
    });
    expect(dnsRecordInputs()).not.toHaveProperty("proxied");
    await expect(valueOf(txt.protectionMode)).resolves.toBe("dns-only");
  });

  it("rejects invalid hostnames before provider resource registration", () => {
    expect(
      () =>
        new PublicHostname("bad", {
          tier: "sandbox",
          zoneId: "zone_123",
          hostname: "*.example",
          recordType: "A",
          target: "203.0.113.10",
          purpose: "public-app",
        }),
    ).toThrow(/valid FQDN/);
    expect(registrations.filter((r) => !r.type.startsWith("hulumi:"))).toHaveLength(0);
  });
});
