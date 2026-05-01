import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

import type { Tier } from "../aws/tier";
import type { ActionsAllowlistConfig } from "./org-foundation.args";

/**
 * Validate a single Actions-allowlist pattern against the GitHub allowlist
 * syntax. GitHub's allowlist accepts patterns like `actions/checkout@*` and
 * `aws-actions/configure-aws-credentials@v4` but rejects shell metacharacters.
 * This function rejects characters that have no place in a valid allowlist
 * pattern: `;`, backticks, `$`, `(`, `)`, `&`, `|`, `<`, `>`, `\`, newlines,
 * and any control character.
 */
function assertActionsPatternSafe(pattern: string): void {
  if (typeof pattern !== "string" || pattern.length === 0) {
    throw new Error(
      "Actions allowlist pattern must be a non-empty string per GitHub allowlist syntax",
    );
  }
  if (pattern.length > 256) {
    throw new Error(`Actions allowlist pattern too long (${pattern.length} chars; max 256)`);
  }
  // Reject path-traversal explicitly — `..` only valid inside owner names is
  // not a legal allowlist token and is a clear smell.
  if (pattern.includes("..")) {
    throw new Error(
      `Actions allowlist pattern "${pattern}" contains invalid character ".." path-traversal sequence (GitHub allowlist syntax)`,
    );
  }
  // eslint-disable-next-line no-control-regex
  const blacklist = /[;`$()&|<>\\\r\n\t\x00-\x1f]/;
  if (blacklist.test(pattern)) {
    throw new Error(
      `Actions allowlist pattern "${pattern}" contains invalid character (shell metacharacter or control); expected GitHub allowlist syntax`,
    );
  }
}

export function createActionsOrganizationPermissions(
  parent: pulumi.ComponentResource,
  args: {
    name: string;
    tier: Tier;
    allowlist?: ActionsAllowlistConfig;
    provider?: github.Provider;
  },
): github.ActionsOrganizationPermissions {
  const isStartupHardened = args.tier === "startup-hardened";

  // Tier-gated defaults:
  //   startup-hardened → allowedActions: "selected", shaPinningRequired: true
  //   sandbox          → allowedActions: "local_only", shaPinningRequired: false
  const allowedActions =
    args.allowlist?.allowedActions ?? (isStartupHardened ? "selected" : "local_only");
  const shaPinningRequired = args.allowlist?.shaPinningRequired ?? isStartupHardened;

  // Validate every pattern character-by-character before issuing the API call.
  const patterns = args.allowlist?.selectedActionsPatterns ?? [];
  for (const p of patterns) {
    assertActionsPatternSafe(p);
  }

  const opts: pulumi.ResourceOptions = args.provider
    ? { parent, provider: args.provider }
    : { parent };

  const permArgs: github.ActionsOrganizationPermissionsArgs = {
    enabledRepositories: "all",
    allowedActions,
    shaPinningRequired,
  };
  if (allowedActions === "selected") {
    permArgs.allowedActionsConfig = {
      githubOwnedAllowed: true,
      verifiedAllowed: true,
      patternsAlloweds: patterns,
    };
  }

  return new github.ActionsOrganizationPermissions(`${args.name}-actions-perms`, permArgs, opts);
}
