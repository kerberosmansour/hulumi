import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export type OriginRuntimeKind = "eks" | "ecs" | "ec2" | "serverless";
export type RuntimeAutomation = "managed-contract" | "cookbook-only";

export interface OriginRuntimeContract {
  readonly kind: OriginRuntimeKind;
  readonly automation: RuntimeAutomation;
  readonly notes?: string;
}

export interface ListenerAuthSecretReferences {
  readonly currentSecretReference: string;
  readonly nextSecretReference?: string;
}

interface OriginIngressCommonArgs {
  readonly tier: Tier;
  readonly hostname: string;
  readonly listenerAuth?: ListenerAuthSecretReferences;
}

export interface CloudflareOriginIngressTunnelArgs extends OriginIngressCommonArgs {
  readonly mode: "tunnel";
  readonly cloudflareAccountId: pulumi.Input<string>;
  readonly tunnelName?: string;
  readonly tunnelSecret: pulumi.Input<string>;
  readonly service: pulumi.Input<string>;
  readonly runtime: OriginRuntimeContract;
}

export interface CloudflareOriginIngressAllowlistAopArgs extends OriginIngressCommonArgs {
  readonly mode: "allowlistAop";
  readonly cloudflareZoneId: pulumi.Input<string>;
  readonly cloudflareSourceCidrBlocks: readonly string[];
  readonly loadBalancerSecurityGroupId: pulumi.Input<string>;
  readonly targetSecurityGroupId: pulumi.Input<string>;
  readonly originPort: number;
  readonly originCertificateReference: string;
  readonly authenticatedOriginPullCertificateId: pulumi.Input<string>;
  readonly aopMode: "zone" | "hostname";
}

export type CloudflareOriginIngressArgs =
  | CloudflareOriginIngressTunnelArgs
  | CloudflareOriginIngressAllowlistAopArgs;
