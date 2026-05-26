import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

import type {
  CloudflarePlan,
  EdgeWafAction,
  EdgeWafExpression,
  EdgeWafBaselineArgs,
  EdgeWafCustomRule,
  EdgeWafRateLimitRule,
  LoginRateLimitRuleArgs,
} from "./edge-waf-baseline.args";
import type { EdgeWafBaselineOutputs } from "./edge-waf-baseline.outputs";
import {
  andExpressions,
  anyMethod,
  hasControlCharacters,
  pathStartsWith,
  type RulesetExpression,
} from "./ruleset-expressions";
import { assertValidTier } from "./tier";

export const EDGE_WAF_BASELINE_COMPONENT_TYPE = "hulumi:cloudflare:EdgeWafBaseline";
export const MAX_CUSTOM_WAF_RULES = 20;

const CLOUDFLARE_PLANS: readonly CloudflarePlan[] = ["free", "pro", "business", "enterprise"];
const WAF_ACTIONS: readonly EdgeWafAction[] = ["block", "challenge", "managed_challenge", "log"];
const MANAGED_WAF_PLANS: readonly CloudflarePlan[] = ["business", "enterprise"];
const CLOUDFLARE_MANAGED_RULESET_ID = "efb7b8c949ac4650a09736fc376e9aee";
const OWASP_CORE_RULESET_ID = "4814384a9e5d4991b9815dcfc25d2f1f";

export function loginRateLimitRule(args: LoginRateLimitRuleArgs = {}): EdgeWafRateLimitRule {
  const pathPrefix = args.pathPrefix ?? "/login";
  return {
    name: "login-rate-limit",
    expression: andExpressions(pathStartsWith(pathPrefix), anyMethod(args.methods ?? ["POST"])),
    action: "managed_challenge",
    requestsPerPeriod: args.requestsPerPeriod ?? 10,
    periodSeconds: args.periodSeconds ?? 60,
    mitigationTimeoutSeconds: args.mitigationTimeoutSeconds ?? 600,
    characteristics: ["ip.src"],
  };
}

export function authenticationRateLimitRule(
  args: LoginRateLimitRuleArgs = {},
): EdgeWafRateLimitRule {
  return {
    ...loginRateLimitRule({
      pathPrefix: args.pathPrefix ?? "/auth",
      ...(args.methods !== undefined ? { methods: args.methods } : {}),
      requestsPerPeriod: args.requestsPerPeriod ?? 20,
      periodSeconds: args.periodSeconds ?? 60,
      mitigationTimeoutSeconds: args.mitigationTimeoutSeconds ?? 600,
    }),
    name: "auth-rate-limit",
  };
}

export function apiRateLimitRule(args: LoginRateLimitRuleArgs = {}): EdgeWafRateLimitRule {
  return {
    ...loginRateLimitRule({
      pathPrefix: args.pathPrefix ?? "/api",
      methods: args.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE"],
      requestsPerPeriod: args.requestsPerPeriod ?? 120,
      periodSeconds: args.periodSeconds ?? 60,
      mitigationTimeoutSeconds: args.mitigationTimeoutSeconds ?? 300,
    }),
    name: "api-rate-limit",
  };
}

export function passwordResetRateLimitRule(
  args: LoginRateLimitRuleArgs = {},
): EdgeWafRateLimitRule {
  return {
    ...loginRateLimitRule({
      pathPrefix: args.pathPrefix ?? "/password-reset",
      methods: args.methods ?? ["POST"],
      requestsPerPeriod: args.requestsPerPeriod ?? 5,
      periodSeconds: args.periodSeconds ?? 300,
      mitigationTimeoutSeconds: args.mitigationTimeoutSeconds ?? 900,
    }),
    name: "password-reset-rate-limit",
  };
}

function assertPlan(plan: CloudflarePlan): void {
  if (!CLOUDFLARE_PLANS.includes(plan)) {
    throw new Error(`EdgeWafBaseline: plan must be one of ${CLOUDFLARE_PLANS.join(", ")}`);
  }
}

function assertZoneId(zoneId: pulumi.Input<string>): void {
  if (typeof zoneId === "string" && zoneId.trim().length === 0) {
    throw new Error("EdgeWafBaseline: zoneId must be a non-empty Cloudflare zone identifier");
  }
}

function assertRuleName(name: string, fieldName: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error(`EdgeWafBaseline: ${fieldName} rule name must be non-empty`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/u.test(trimmed)) {
    throw new Error(
      `EdgeWafBaseline: ${fieldName} rule name "${name}" must be a stable identifier`,
    );
  }
  return trimmed;
}

function assertExpressionString(expression: string): string {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    throw new Error("EdgeWafBaseline: ruleset expression must be non-empty");
  }
  if (hasControlCharacters(trimmed)) {
    throw new Error("EdgeWafBaseline: ruleset expression must not contain control characters");
  }
  return trimmed;
}

function isRulesetExpression(expression: EdgeWafExpression): expression is RulesetExpression {
  return (
    typeof expression === "object" &&
    expression !== null &&
    "expression" in expression &&
    "source" in expression
  );
}

function assertExpression(expression: EdgeWafExpression): pulumi.Input<string> {
  if (isRulesetExpression(expression)) {
    return assertExpressionString(expression.expression);
  }
  if (typeof expression === "string") {
    return assertExpressionString(expression);
  }
  return pulumi.output(expression).apply(assertExpressionString);
}

function assertAction(action: EdgeWafAction): void {
  if (!WAF_ACTIONS.includes(action)) {
    throw new Error(`EdgeWafBaseline: action must be one of ${WAF_ACTIONS.join(", ")}`);
  }
}

function validateCustomRules(rules: readonly EdgeWafCustomRule[]): void {
  if (rules.length > MAX_CUSTOM_WAF_RULES) {
    throw new Error(
      `EdgeWafBaseline: maximum of ${MAX_CUSTOM_WAF_RULES} custom WAF rules exceeded`,
    );
  }
  for (const rule of rules) {
    assertRuleName(rule.name, "custom");
    assertExpression(rule.expression);
    assertAction(rule.action);
  }
}

function validateRateLimitRules(rules: readonly EdgeWafRateLimitRule[]): void {
  if (rules.length > MAX_CUSTOM_WAF_RULES) {
    throw new Error(
      `EdgeWafBaseline: maximum of ${MAX_CUSTOM_WAF_RULES} rate-limit rules exceeded`,
    );
  }
  for (const rule of rules) {
    assertRuleName(rule.name, "rate-limit");
    assertExpression(rule.expression);
    assertAction(rule.action ?? "managed_challenge");
    if (!Number.isInteger(rule.requestsPerPeriod) || rule.requestsPerPeriod < 1) {
      throw new Error("EdgeWafBaseline: requestsPerPeriod must be a positive integer");
    }
    if (!Number.isInteger(rule.periodSeconds) || rule.periodSeconds < 10) {
      throw new Error("EdgeWafBaseline: periodSeconds must be at least 10 seconds");
    }
    if (
      rule.mitigationTimeoutSeconds !== undefined &&
      (!Number.isInteger(rule.mitigationTimeoutSeconds) || rule.mitigationTimeoutSeconds < 0)
    ) {
      throw new Error("EdgeWafBaseline: mitigationTimeoutSeconds must be a non-negative integer");
    }
  }
}

function customRulesetRule(rule: EdgeWafCustomRule): cloudflare.types.input.RulesetRule {
  return {
    action: rule.action,
    description: rule.description ?? rule.name,
    expression: assertExpression(rule.expression),
    ref: rule.name,
  };
}

function rateLimitRulesetRule(rule: EdgeWafRateLimitRule): cloudflare.types.input.RulesetRule {
  const rateLimit: cloudflare.types.input.RulesetRuleRatelimit = {
    characteristics: [...(rule.characteristics ?? ["ip.src"])],
    period: rule.periodSeconds,
    requestsPerPeriod: rule.requestsPerPeriod,
    requestsToOrigin: true,
  };
  if (rule.mitigationTimeoutSeconds !== undefined) {
    rateLimit.mitigationTimeout = rule.mitigationTimeoutSeconds;
  }
  return {
    action: rule.action ?? "managed_challenge",
    description: rule.name,
    expression: assertExpression(rule.expression),
    ratelimit: rateLimit,
    ref: rule.name,
  };
}

export class EdgeWafBaseline extends pulumi.ComponentResource implements EdgeWafBaselineOutputs {
  public readonly rulesetIds: pulumi.Output<string[]>;
  public readonly appliedControls: pulumi.Output<string[]>;
  public readonly unsupportedControls: pulumi.Output<string[]>;
  public readonly degradedControls: pulumi.Output<string[]>;

  constructor(name: string, args: EdgeWafBaselineArgs, opts?: pulumi.ComponentResourceOptions) {
    super(EDGE_WAF_BASELINE_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    assertPlan(args.plan);
    assertZoneId(args.zoneId);

    const customRules = args.customRules ?? [];
    const rateLimitRules = args.rateLimitRules ?? [];
    validateCustomRules(customRules);
    validateRateLimitRules(rateLimitRules);

    const appliedControls: string[] = [];
    const unsupportedControls: string[] = [];
    const rulesets: cloudflare.Ruleset[] = [];
    const managedRequested = args.enableManagedRulesets ?? args.tier === "startup-hardened";
    const managedSupported = MANAGED_WAF_PLANS.includes(args.plan);

    if (managedRequested && managedSupported) {
      const managedRules: cloudflare.types.input.RulesetRule[] = [
        {
          action: "execute",
          actionParameters: { id: CLOUDFLARE_MANAGED_RULESET_ID },
          description: "Cloudflare Managed Ruleset",
          expression: "true",
          ref: "cloudflare-managed-ruleset",
        },
        {
          action: "execute",
          actionParameters: { id: OWASP_CORE_RULESET_ID },
          description: "OWASP Core Ruleset",
          expression: "true",
          ref: "owasp-core-ruleset",
        },
      ];
      const managed = new cloudflare.Ruleset(
        `${name}-managed-waf`,
        {
          zoneId: args.zoneId,
          name: `${name} managed WAF`,
          kind: "zone",
          phase: "http_request_firewall_managed",
          description: "Hulumi managed WAF baseline",
          rules: managedRules,
        },
        { parent: this },
      );
      rulesets.push(managed);
      appliedControls.push("managed_ruleset_cloudflare", "managed_ruleset_owasp_core");
    } else if (managedRequested) {
      unsupportedControls.push("managed_ruleset_cloudflare", "managed_ruleset_owasp_core");
    }

    if (customRules.length > 0) {
      const custom = new cloudflare.Ruleset(
        `${name}-custom-waf`,
        {
          zoneId: args.zoneId,
          name: `${name} custom WAF`,
          kind: "zone",
          phase: "http_request_firewall_custom",
          description: "Hulumi bounded custom WAF rules",
          rules: customRules.map(customRulesetRule),
        },
        { parent: this },
      );
      rulesets.push(custom);
      appliedControls.push("custom_waf_rules");
    }

    if (rateLimitRules.length > 0) {
      const rateLimit = new cloudflare.Ruleset(
        `${name}-rate-limit`,
        {
          zoneId: args.zoneId,
          name: `${name} rate limits`,
          kind: "zone",
          phase: "http_ratelimit",
          description: "Hulumi route rate-limit rules",
          rules: rateLimitRules.map(rateLimitRulesetRule),
        },
        { parent: this },
      );
      rulesets.push(rateLimit);
      appliedControls.push("route_rate_limits");
    }

    this.rulesetIds =
      rulesets.length > 0 ? pulumi.all(rulesets.map((ruleset) => ruleset.id)) : pulumi.output([]);
    this.appliedControls = pulumi.output(appliedControls);
    this.unsupportedControls = pulumi.output(unsupportedControls);
    this.degradedControls = pulumi.output([]);

    this.registerOutputs({
      rulesetIds: this.rulesetIds,
      appliedControls: this.appliedControls,
      unsupportedControls: this.unsupportedControls,
      degradedControls: this.degradedControls,
    });
  }
}
