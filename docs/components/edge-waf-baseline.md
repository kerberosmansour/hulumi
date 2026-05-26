# EdgeWafBaseline

`EdgeWafBaseline` creates bounded Cloudflare WAF and route rate-limit resources for an existing zone.

## Behavior

- Business and Enterprise plans receive Cloudflare-managed and OWASP managed ruleset execute rules when `enableManagedRulesets` is enabled.
- Lower plans do not silently no-op. The component records `managed_ruleset_cloudflare` and `managed_ruleset_owasp_core` in `unsupportedControls`.
- Consumer custom rules are capped at 20 rules and can use `validatedRulesetExpression`, one of the typed helper expressions, or a `pulumi.Input<string>` when the expression is assembled from secret config.
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

For IP-gated APIs, build the allowlist expression as a Pulumi secret output when it contains private operator CIDRs:

```ts
import * as pulumi from "@pulumi/pulumi";

new EdgeWafBaseline("api-edge", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  plan: "free",
  enableManagedRulesets: false,
  customRules: [
    {
      name: "operator-ip-gate",
      action: "block",
      expression: pulumi.secret(
        '(http.host in {"api.example.com"}) and not ip.src in {198.51.100.10/32}',
      ),
    },
  ],
});
```

Use `appliedControls`, `unsupportedControls`, and `degradedControls` as machine-readable evidence for policy and drift checks.
