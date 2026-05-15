import type * as pulumi from "@pulumi/pulumi";

import type { OriginRuntimeContract } from "./cloudflare-origin-ingress.args";

export interface ListenerAuthRotationPlan {
  readonly currentSecretReference: string;
  readonly nextSecretReference?: string;
  readonly steps: readonly string[];
}

export interface CloudflareOriginIngressOutputs {
  readonly protectionLayers: pulumi.Output<string[]>;
  readonly runtimeContracts: pulumi.Output<OriginRuntimeContract[]>;
  readonly listenerAuthRotation: pulumi.Output<ListenerAuthRotationPlan | undefined>;
  readonly degradedControls: pulumi.Output<string[]>;
  readonly resourceIds: pulumi.Output<string[]>;
}
