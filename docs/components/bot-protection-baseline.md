# BotProtectionBaseline

`BotProtectionBaseline` maps a requested bot-defense intent to the Cloudflare controls available on the declared plan.

## Behavior

- `intent: "simple"` enables Bot Fight Mode.
- `intent: "balanced"` uses Super Bot Fight Mode where the declared plan supports it, otherwise records the downgrade in `degradedControls` and `unsupportedControls`.
- `intent: "granular"` only records `bot_management` and `per_request_bot_score` in `appliedControls` on Enterprise.
- Granular intent on lower plans applies a supported fallback and records `bot_management_granular` plus the missing Enterprise controls.

## Example

```ts
import { BotProtectionBaseline } from "@hulumi/cloudflare-baseline";

const bots = new BotProtectionBaseline("bots", {
  tier: "startup-hardened",
  zoneId: "zone_123",
  plan: "pro",
  intent: "granular",
});
```

For the example above, the component applies a lower-plan fallback and exposes the Enterprise-only gap through outputs. It does not claim per-request bot scoring unless `plan: "enterprise"` is selected.
