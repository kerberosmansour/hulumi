import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

import { assertValidTier } from "./tier";
import type { ZoneFoundationArgs } from "./zone-foundation.args";
import type { ZoneFoundationOutputs } from "./zone-foundation.outputs";

export const ZONE_FOUNDATION_COMPONENT_TYPE = "hulumi:cloudflare:ZoneFoundation";

export class ZoneFoundation extends pulumi.ComponentResource implements ZoneFoundationOutputs {
  public readonly zoneId: pulumi.Output<string>;
  public readonly dnssecStatus: pulumi.Output<string>;
  public readonly dsRecord: pulumi.Output<string>;
  public readonly sslMode: pulumi.Output<"full" | "strict">;
  public readonly appliedControls: pulumi.Output<string[]>;

  constructor(name: string, args: ZoneFoundationArgs, opts?: pulumi.ComponentResourceOptions) {
    super(ZONE_FOUNDATION_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);

    if (typeof args.zoneId === "string" && args.zoneId.trim().length === 0) {
      throw new Error("ZoneFoundation: zoneId must be a non-empty Cloudflare zone identifier");
    }

    const sslMode = args.sslMode ?? "strict";
    const dnssec = new cloudflare.ZoneDnssec(
      `${name}-dnssec`,
      {
        zoneId: args.zoneId,
        status: args.enableDnssec === false ? "disabled" : "active",
      },
      { parent: this },
    );

    new cloudflare.ZoneSetting(
      `${name}-ssl-mode`,
      {
        zoneId: args.zoneId,
        settingId: "ssl",
        value: sslMode,
      },
      { parent: this },
    );

    const settingResources: string[] = [];
    const settings = args.settings ?? {};
    if (settings.minTlsVersion !== undefined) {
      new cloudflare.ZoneSetting(
        `${name}-min-tls-version`,
        {
          zoneId: args.zoneId,
          settingId: "min_tls_version",
          value: settings.minTlsVersion,
        },
        { parent: this },
      );
      settingResources.push("min_tls_version");
    }
    if (settings.alwaysUseHttps !== undefined) {
      new cloudflare.ZoneSetting(
        `${name}-always-use-https`,
        {
          zoneId: args.zoneId,
          settingId: "always_use_https",
          value: pulumi
            .output(settings.alwaysUseHttps)
            .apply((enabled) => (enabled ? "on" : "off")),
        },
        { parent: this },
      );
      settingResources.push("always_use_https");
    }
    if (settings.automaticHttpsRewrites !== undefined) {
      new cloudflare.ZoneSetting(
        `${name}-automatic-https-rewrites`,
        {
          zoneId: args.zoneId,
          settingId: "automatic_https_rewrites",
          value: pulumi
            .output(settings.automaticHttpsRewrites)
            .apply((enabled) => (enabled ? "on" : "off")),
        },
        { parent: this },
      );
      settingResources.push("automatic_https_rewrites");
    }

    this.zoneId = pulumi.output(args.zoneId);
    this.dnssecStatus = dnssec.status.apply((status) => status ?? "unknown");
    this.dsRecord = dnssec.ds;
    this.sslMode = pulumi.output(sslMode);
    this.appliedControls = pulumi.output([
      ...(args.enableDnssec === false ? [] : ["dnssec"]),
      `ssl_mode_${sslMode}`,
      ...settingResources,
    ]);

    this.registerOutputs({
      zoneId: this.zoneId,
      dnssecStatus: this.dnssecStatus,
      dsRecord: this.dsRecord,
      sslMode: this.sslMode,
      appliedControls: this.appliedControls,
    });
  }
}
