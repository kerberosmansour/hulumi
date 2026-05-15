import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";
import type { HttpMethod, RulesetExpression } from "./ruleset-expressions";

export type CloudflarePlan = "free" | "pro" | "business" | "enterprise";
export type EdgeWafAction = "block" | "challenge" | "managed_challenge" | "log";

export interface EdgeWafCustomRule {
  readonly name: string;
  readonly expression: RulesetExpression;
  readonly action: EdgeWafAction;
  readonly description?: string;
}

export interface EdgeWafRateLimitRule {
  readonly name: string;
  readonly expression: RulesetExpression;
  readonly action?: Exclude<EdgeWafAction, "log">;
  readonly requestsPerPeriod: number;
  readonly periodSeconds: number;
  readonly mitigationTimeoutSeconds?: number;
  readonly characteristics?: readonly string[];
}

export interface EdgeWafBaselineArgs {
  readonly tier: Tier;
  readonly zoneId: pulumi.Input<string>;
  readonly plan: CloudflarePlan;
  readonly enableManagedRulesets?: boolean;
  readonly customRules?: readonly EdgeWafCustomRule[];
  readonly rateLimitRules?: readonly EdgeWafRateLimitRule[];
}

export interface LoginRateLimitRuleArgs {
  readonly pathPrefix?: string;
  readonly methods?: readonly HttpMethod[];
  readonly requestsPerPeriod?: number;
  readonly periodSeconds?: number;
  readonly mitigationTimeoutSeconds?: number;
}
