import type * as pulumi from "@pulumi/pulumi";

export type PublicHostnameProtectionMode = "proxied" | "dns-only";

export interface PublicHostnameOutputs {
  readonly hostname: pulumi.Output<string>;
  readonly recordId: pulumi.Output<string>;
  readonly proxied: pulumi.Output<boolean>;
  readonly protectionMode: pulumi.Output<PublicHostnameProtectionMode>;
  readonly dnsOnlyJustification: pulumi.Output<string | undefined>;
}
