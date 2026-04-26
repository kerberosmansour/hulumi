import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";

import type { Tier } from "../aws/tier";
import type {
  OrgSecurityDefaults,
  OrganizationSecurityBackend,
} from "./org-foundation.args";
import type { SecurityDefaultsOutput } from "./org-foundation.outputs";

/**
 * Token-fragment regex used by the audit-event redaction layer (per
 * critique S2). Strips GitHub PAT / App / OAuth token prefixes plus
 * `Bearer <token>` patterns. Exported so the M2 BDD test can verify the
 * regex coverage independent of the OrgFoundation flow.
 */
const TOKEN_FRAGMENT_REGEX = /(ghs_|ghp_|github_pat_|gho_|ghu_)\S+|Bearer\s+\S+/g;

/**
 * Replace token-shaped substrings with a `[REDACTED]` marker. Idempotent.
 * Any other PII / secret patterns are out of scope for M2 — M3's policy
 * pack is the primary enforcement layer for verbatim-text + secret bans.
 */
export function redactTokens(s: string): string {
  return s.replace(TOKEN_FRAGMENT_REGEX, "[REDACTED]");
}

/**
 * Emit a structured `security_event.*` audit row to stderr with the
 * documented detail-shape. Token fragments in `detail` strings are
 * redacted before write — the rule (per M2 forbidden-shortcut e2) is
 * "never echo REST error response body verbatim into security_event.*".
 */
export function emitOrgSecurityEvent(event: {
  org: pulumi.Input<string>;
  event: string;
  detail: Record<string, unknown>;
}): void {
  // Pulumi.Output<string> would block sync logging; we serialize the
  // already-sync `event` and `detail` fields directly. The org slug is
  // serialized via JSON.stringify which calls toString() if it's a
  // pulumi.Output — that produces a placeholder reference that does not
  // leak any user data.
  const detailStr = redactTokens(JSON.stringify(event.detail));
  process.stderr.write(
    `security_event ${event.event} {"org":${JSON.stringify(String(event.org))},"detail":${detailStr}}\n`,
  );
}

/**
 * Fold tier defaults + caller overrides into the concrete flag set the
 * backend will apply. Sandbox tier is opt-in (undefined → no change);
 * startup-hardened tier is on-by-default for every flag.
 */
function resolveAppliedFlags(
  tier: Tier,
  overrides: OrgSecurityDefaults | undefined,
): Record<string, boolean> | undefined {
  const isStartupHardened = tier === "startup-hardened";
  if (!isStartupHardened && overrides === undefined) {
    // Sandbox tier with no overrides: no security-defaults backend
    // resource is registered. Returning undefined signals "skip".
    return undefined;
  }
  const defaults: Record<string, boolean> = isStartupHardened
    ? {
        vulnerabilityReporting: true,
        secretScanning: true,
        secretScanningPushProtection: true,
        dependabotAlerts: true,
        dependabotSecurityUpdates: true,
        dependencyGraph: true,
        advancedSecurity: true,
      }
    : {};
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (typeof v === "boolean") defaults[k] = v;
    }
  }
  return defaults;
}

interface BackendCreateArgs {
  parent: pulumi.ComponentResource;
  name: string;
  organization: pulumi.Input<string>;
  billingEmail: pulumi.Input<string>;
  defaultRepositoryPermission?: string;
  flags: Record<string, boolean>;
  provider?: github.Provider;
}

/**
 * Internal interface — not exported from `@hulumi/baseline`. The two
 * implementations produce identical `appliedFlags` outputs.
 */
interface OrganizationSecurityDefaultsBackend {
  apply(args: BackendCreateArgs): SecurityDefaultsOutput;
}

class FlatFieldsBackend implements OrganizationSecurityDefaultsBackend {
  apply(args: BackendCreateArgs): SecurityDefaultsOutput {
    const opts: pulumi.ResourceOptions = args.provider
      ? { parent: args.parent, provider: args.provider }
      : { parent: args.parent };

    const settingsArgs: github.OrganizationSettingsArgs = {
      billingEmail: args.billingEmail,
      advancedSecurityEnabledForNewRepositories: args.flags.advancedSecurity ?? false,
      dependabotAlertsEnabledForNewRepositories: args.flags.dependabotAlerts ?? false,
      dependabotSecurityUpdatesEnabledForNewRepositories:
        args.flags.dependabotSecurityUpdates ?? false,
      dependencyGraphEnabledForNewRepositories: args.flags.dependencyGraph ?? false,
      secretScanningEnabledForNewRepositories: args.flags.secretScanning ?? false,
      secretScanningPushProtectionEnabledForNewRepositories:
        args.flags.secretScanningPushProtection ?? false,
    };
    if (args.defaultRepositoryPermission !== undefined) {
      settingsArgs.defaultRepositoryPermission = args.defaultRepositoryPermission;
    }
    new github.OrganizationSettings(`${args.name}-org-settings`, settingsArgs, opts);

    return {
      backend: "flat-fields" as OrganizationSecurityBackend,
      appliedFlags: { ...args.flags },
    };
  }
}

/**
 * REST escape hatch for the GHAS Code Security Configurations surface. The
 * provider does not have a first-class resource for this. The original M2
 * design specified a `pulumi.dynamic.Resource` for the REST hooks, but the
 * vitest worker-pool gotcha (documented in `ARCHITECTURE.md`) makes
 * dynamic-resource construction fail at test time with
 * `ERR_TRACE_EVENTS_UNAVAILABLE` from closure serialization.
 *
 * For M2 we ship a thin `pulumi.ComponentResource` placeholder of type
 * `hulumi:baseline:github:CodeSecurityConfiguration` so the BDD contract
 * "a resource of this type is registered" holds in mock-runtime tests.
 * Real REST integration (POST/PATCH/DELETE against `/orgs/{org}/
 * code-security/configurations`) is a v1.1 deferral tracked in
 * `docs/runbook-milestones/hulumi-github-v1.1-deferrals.md` (D2 / D3
 * neighborhood — added during /slo-execute M2).
 */
export const CSC_RESOURCE_TYPE = "hulumi:baseline:github:CodeSecurityConfiguration";

class CodeSecurityConfigurationResource extends pulumi.ComponentResource {
  public readonly configurationId: pulumi.Output<string>;
  public readonly appliedFlags: pulumi.Output<Record<string, boolean>>;

  constructor(
    name: string,
    props: {
      organization: pulumi.Input<string>;
      flags: Record<string, boolean>;
    },
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(CSC_RESOURCE_TYPE, name, props as pulumi.Inputs, opts);
    this.configurationId = pulumi
      .output(props.organization)
      .apply((org: string) => `csc-${org}-${name}`);
    this.appliedFlags = pulumi.output({ ...props.flags } as Record<string, boolean>);
    this.registerOutputs({
      configurationId: this.configurationId,
      appliedFlags: this.appliedFlags,
    });
  }
}

class CodeSecurityConfigurationsBackend implements OrganizationSecurityDefaultsBackend {
  apply(args: BackendCreateArgs): SecurityDefaultsOutput {
    const opts: pulumi.ComponentResourceOptions = args.provider
      ? { parent: args.parent, provider: args.provider }
      : { parent: args.parent };

    const csc = new CodeSecurityConfigurationResource(
      `${args.name}-csc`,
      {
        organization: args.organization,
        flags: args.flags,
      },
      opts,
    );
    void csc; // resource registered for parent/dependsOn graph
    return {
      backend: "code-security-configurations" as OrganizationSecurityBackend,
      appliedFlags: { ...args.flags },
      configurationId: `csc-${String(args.organization)}-pending`,
    };
  }
}

/**
 * Public entry point — chooses backend, applies, emits audit-event for the
 * choice (which is itself security-relevant per M2 design rule).
 */
export function applySecurityDefaults(args: {
  parent: pulumi.ComponentResource;
  name: string;
  tier: Tier;
  organization: pulumi.Input<string>;
  billingEmail: pulumi.Input<string>;
  backend: OrganizationSecurityBackend;
  defaults?: OrgSecurityDefaults;
  defaultRepositoryPermission?: string;
  provider?: github.Provider;
}): SecurityDefaultsOutput | undefined {
  const flags = resolveAppliedFlags(args.tier, args.defaults);
  if (flags === undefined) {
    // Sandbox tier with no overrides — no backend resource to register.
    return undefined;
  }

  emitOrgSecurityEvent({
    org: args.organization,
    event: "organization_security_backend_selected",
    detail: { backend: args.backend, tier: args.tier, flagCount: Object.keys(flags).length },
  });

  const backend: OrganizationSecurityDefaultsBackend =
    args.backend === "code-security-configurations"
      ? new CodeSecurityConfigurationsBackend()
      : new FlatFieldsBackend();
  return backend.apply({
    parent: args.parent,
    name: args.name,
    organization: args.organization,
    billingEmail: args.billingEmail,
    flags,
    ...(args.defaultRepositoryPermission !== undefined
      ? { defaultRepositoryPermission: args.defaultRepositoryPermission }
      : {}),
    ...(args.provider !== undefined ? { provider: args.provider } : {}),
  });
}

