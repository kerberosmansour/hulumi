import { afterEach, describe, expect, it } from "vitest";

import { ZoneFoundation } from "../src";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

describe("ZoneFoundation", () => {
  afterEach(() => {
    resetRegistrations();
  });

  it("registers DNSSEC and secure SSL zone settings for startup-hardened zones", async () => {
    const zone = new ZoneFoundation("app-zone", {
      tier: "startup-hardened",
      zoneId: "zone_123",
    });

    await settlePulumi();

    expect(registrations.map((r) => r.type)).toContain("cloudflare:index/zoneDnssec:ZoneDnssec");
    expect(registrations.map((r) => r.type)).toContain("cloudflare:index/zoneSetting:ZoneSetting");
    await expect(valueOf(zone.dnssecStatus)).resolves.toBe("active");
    await expect(valueOf(zone.sslMode)).resolves.toBe("strict");
  });

  it("keeps the empty optional settings state explicit", async () => {
    const zone = new ZoneFoundation("empty-zone", {
      tier: "sandbox",
      zoneId: "zone_empty",
    });

    await settlePulumi();

    const childResources = registrations.filter((r) => !r.type.startsWith("hulumi:"));
    expect(childResources).toHaveLength(2);
    await expect(valueOf(zone.appliedControls)).resolves.toEqual(["dnssec", "ssl_mode_strict"]);
  });

  it("uses Cloudflare API snake_case setting identifiers for optional zone settings", async () => {
    new ZoneFoundation("api-zone", {
      tier: "startup-hardened",
      zoneId: "zone_123",
      settings: {
        minTlsVersion: "1.2",
        alwaysUseHttps: true,
        automaticHttpsRewrites: true,
      },
    });

    await settlePulumi();

    const settingIds = registrations
      .filter((r) => r.type === "cloudflare:index/zoneSetting:ZoneSetting")
      .map((r) => r.inputs.settingId);

    expect(settingIds).toEqual(
      expect.arrayContaining([
        "ssl",
        "min_tls_version",
        "always_use_https",
        "automatic_https_rewrites",
      ]),
    );
    expect(settingIds).not.toEqual(
      expect.arrayContaining(["minTlsVersion", "alwaysUseHttps", "automaticHttpsRewrites"]),
    );
  });
});
