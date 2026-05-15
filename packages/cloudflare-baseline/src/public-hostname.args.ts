import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export type PublicHostnameRecordType = "A" | "AAAA" | "CNAME" | "MX" | "TXT";
export type PublicHostnamePurpose = "public-app" | "dns";

export interface PublicHostnameArgs {
  readonly tier: Tier;
  readonly zoneId: pulumi.Input<string>;
  readonly hostname: string;
  readonly recordType: PublicHostnameRecordType;
  readonly target: pulumi.Input<string>;
  readonly purpose: PublicHostnamePurpose;
  readonly ttl?: pulumi.Input<number>;
  readonly priority?: pulumi.Input<number>;
  readonly proxied?: boolean;
  readonly acknowledgeDnsOnlyExposure?: boolean;
  readonly dnsOnlyJustification?: string;
  readonly comment?: pulumi.Input<string>;
}
