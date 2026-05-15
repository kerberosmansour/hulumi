import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export type CloudflareSslMode = "full" | "strict";
export type CloudflareMinimumTlsVersion = "1.2" | "1.3";

export interface ZoneFoundationSettings {
  readonly alwaysUseHttps?: pulumi.Input<boolean>;
  readonly automaticHttpsRewrites?: pulumi.Input<boolean>;
  readonly minTlsVersion?: pulumi.Input<CloudflareMinimumTlsVersion>;
}

export interface ZoneFoundationArgs {
  readonly tier: Tier;
  readonly zoneId: pulumi.Input<string>;
  readonly enableDnssec?: boolean;
  readonly sslMode?: CloudflareSslMode;
  readonly settings?: ZoneFoundationSettings;
}
