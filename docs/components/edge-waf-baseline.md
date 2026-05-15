# EdgeWafBaseline

`EdgeWafBaseline` creates bounded Cloudflare WAF and route rate-limit resources for an existing zone.

## Behavior

- Business and Enterprise plans receive Cloudflare-managed and OWASP managed ruleset execute rules when `enableManagedRulesets` is enabled.
- Lower plans do not silently no-op. The component records `managed_ruleset_cloudflare` and `managed_ruleset_owasp_core` in `unsupportedControls`.
- Consumer custom rules are capped at 20 rules and must use `validatedRulesetExpression` or one of the typed helper expressions.
- Login, authentication, API, and password-reset route helpers emit Cloudflare `http_ratelimit` rules with bounded request and period settings.

## Example

```ts
import {
  EdgeWafBaseline,
  loginRateLimitRule,
  validatedRulesetExpression,
} from "@hulumi/cloudflare-baseline";

const waf = new EdgeWafBaseline("edge", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  plan: "business",
  enableManagedRulesets: true,
  customRules: [
    {
      name: "block-legacy-admin-path",
      action: "block",
      expression: validatedRulesetExpression('http.request.uri.path contains "/legacy-admin"'),
    },
  ],
  rateLimitRules: [
    loginRateLimitRule({
      pathPrefix: "/login",
      requestsPerPeriod: 5,
      periodSeconds: 60,
    }),
  ],
});
```

Use `appliedControls`, `unsupportedControls`, and `degradedControls` as machine-readable evidence for policy and drift checks.
