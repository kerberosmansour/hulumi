import type * as pulumi from "@pulumi/pulumi";

import type { CloudflarePlan } from "./edge-waf-baseline.args";
import type { Tier } from "./tier";

export type BotProtectionIntent = "simple" | "balanced" | "granular";

export interface BotProtectionBaselineArgs {
  readonly tier: Tier;
  readonly zoneId: pulumi.Input<string>;
  readonly plan: CloudflarePlan;
  readonly intent: BotProtectionIntent;
}
