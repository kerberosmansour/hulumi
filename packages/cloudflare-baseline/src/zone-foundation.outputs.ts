import type * as pulumi from "@pulumi/pulumi";

import type { CloudflareSslMode } from "./zone-foundation.args";

export interface ZoneFoundationOutputs {
  readonly zoneId: pulumi.Output<string>;
  readonly dnssecStatus: pulumi.Output<string>;
  readonly dsRecord: pulumi.Output<string>;
  readonly sslMode: pulumi.Output<CloudflareSslMode>;
  readonly appliedControls: pulumi.Output<string[]>;
}
