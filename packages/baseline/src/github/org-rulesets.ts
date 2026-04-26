import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

import type { Tier } from "../aws/tier";

/**
 * Org-level ruleset sub-component. Tier-gated rules:
 *   - Sandbox          → deletion + non-fast-forward (force-push protection)
 *   - Startup-Hardened → adds requiredSignatures (signed commits required)
 *
 * The ruleset targets the default branch of every repo in the org via the
 * `~DEFAULT_BRANCH` magic ref-name token.
 */
export function createOrganizationRuleset(
  parent: pulumi.ComponentResource,
  args: {
    name: string;
    tier: Tier;
    provider?: github.Provider;
  },
): github.OrganizationRuleset {
  const isStartupHardened = args.tier === "startup-hardened";
  const rules: github.types.input.OrganizationRulesetRules = isStartupHardened
    ? { deletion: true, nonFastForward: true, requiredSignatures: true }
    : { deletion: true, nonFastForward: true };

  const opts: pulumi.ResourceOptions = args.provider
    ? { parent, provider: args.provider }
    : { parent };

  return new github.OrganizationRuleset(
    `${args.name}-org-ruleset`,
    {
      name: `${args.name}-org-ruleset`,
      target: "branch",
      enforcement: "active",
      conditions: {
        refName: {
          includes: ["~DEFAULT_BRANCH"],
          excludes: [],
        },
        repositoryName: {
          includes: ["~ALL"],
          excludes: [],
        },
      },
      rules,
    } satisfies github.OrganizationRulesetArgs,
    opts,
  );
}
