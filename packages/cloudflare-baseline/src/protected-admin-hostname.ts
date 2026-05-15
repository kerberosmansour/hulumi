import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";

import type { ProtectedAdminHostnameArgs } from "./protected-admin-hostname.args";
import type { ProtectedAdminHostnameOutputs } from "./protected-admin-hostname.outputs";
import { assertValidTier } from "./tier";

export const PROTECTED_ADMIN_HOSTNAME_COMPONENT_TYPE = "hulumi:cloudflare:ProtectedAdminHostname";

const MAX_HOSTNAME_LENGTH = 253;
const MAX_HOSTNAME_LABEL_LENGTH = 63;

interface IdentitySelectors {
  readonly appIncludes: cloudflare.types.input.ZeroTrustAccessApplicationPolicyInclude[];
  readonly policyIncludes: cloudflare.types.input.ZeroTrustAccessPolicyInclude[];
  readonly labels: string[];
  readonly allowedIdps?: string[];
}

function isAsciiAlpha(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAsciiDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isAsciiAlphaNumeric(char: string): boolean {
  return isAsciiAlpha(char) || isAsciiDigit(char);
}

function hasWhitespace(value: string): boolean {
  for (const char of value) {
    if (char.trim() === "") return true;
  }
  return false;
}

function isValidHostnameLabel(label: string): boolean {
  if (label.length === 0 || label.length > MAX_HOSTNAME_LABEL_LENGTH) return false;
  if (!isAsciiAlphaNumeric(label[0] ?? "")) return false;
  if (!isAsciiAlphaNumeric(label[label.length - 1] ?? "")) return false;

  for (const char of label) {
    if (char !== "-" && !isAsciiAlphaNumeric(char)) return false;
  }

  return true;
}

function isValidDomainName(domain: string): boolean {
  if (domain.length === 0 || domain.length > MAX_HOSTNAME_LENGTH) return false;
  if (domain !== domain.trim() || hasWhitespace(domain)) return false;

  const labels = domain.split(".");
  if (labels.length < 2) return false;
  if (!labels.every(isValidHostnameLabel)) return false;

  const tld = labels[labels.length - 1] ?? "";
  return tld.length >= 2 && [...tld].every(isAsciiAlpha);
}

function isValidEmail(value: string): boolean {
  if (value.length === 0 || value !== value.trim() || hasWhitespace(value)) return false;

  const atIndex = value.indexOf("@");
  if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) return false;

  const localPart = value.slice(0, atIndex);
  const domainPart = value.slice(atIndex + 1);
  return localPart.length > 0 && isValidDomainName(domainPart);
}

function assertHostname(hostname: string): void {
  if (!isValidDomainName(hostname)) {
    throw new Error(
      `ProtectedAdminHostname: hostname "${hostname}" must be a valid FQDN (no wildcards)`,
    );
  }
}

function assertZoneId(zoneId: pulumi.Input<string>): void {
  if (typeof zoneId === "string" && zoneId.trim().length === 0) {
    throw new Error(
      "ProtectedAdminHostname: zoneId must be a non-empty Cloudflare zone identifier",
    );
  }
}

function nonEmptyItems(values: readonly string[] | undefined, fieldName: string): string[] {
  const normalized = (values ?? []).map((value) => value.trim()).filter((value) => value !== "");
  if ((values ?? []).length !== normalized.length) {
    throw new Error(`ProtectedAdminHostname: ${fieldName} entries must be non-empty strings`);
  }
  return normalized;
}

function buildIdentitySelectors(args: ProtectedAdminHostnameArgs): IdentitySelectors {
  const emails = nonEmptyItems(args.allowedEmails, "allowedEmails");
  const domains = nonEmptyItems(args.allowedEmailDomains, "allowedEmailDomains");
  const groupIds = nonEmptyItems(args.allowedAccessGroupIds, "allowedAccessGroupIds");
  const identityProviderIds = nonEmptyItems(
    args.allowedIdentityProviderIds,
    "allowedIdentityProviderIds",
  );

  if (
    emails.length === 0 &&
    domains.length === 0 &&
    groupIds.length === 0 &&
    identityProviderIds.length === 0
  ) {
    throw new Error(
      "ProtectedAdminHostname: an identity allow-list policy is required for admin hostnames",
    );
  }

  const appIncludes: cloudflare.types.input.ZeroTrustAccessApplicationPolicyInclude[] = [];
  const policyIncludes: cloudflare.types.input.ZeroTrustAccessPolicyInclude[] = [];
  const labels: string[] = [];

  for (const email of emails) {
    if (!isValidEmail(email)) {
      throw new Error(`ProtectedAdminHostname: allowedEmails entry "${email}" is not an email`);
    }
    appIncludes.push({ email: { email } });
    policyIncludes.push({ email: { email } });
    labels.push(`email:${email}`);
  }

  for (const domain of domains) {
    if (!isValidDomainName(domain)) {
      throw new Error(
        `ProtectedAdminHostname: allowedEmailDomains entry "${domain}" is not a domain`,
      );
    }
    appIncludes.push({ emailDomain: { domain } });
    policyIncludes.push({ emailDomain: { domain } });
    labels.push(`email_domain:${domain}`);
  }

  for (const id of groupIds) {
    appIncludes.push({ group: { id } });
    policyIncludes.push({ group: { id } });
    labels.push(`access_group:${id}`);
  }

  for (const id of identityProviderIds) {
    appIncludes.push({ loginMethod: { id } });
    policyIncludes.push({ loginMethod: { id } });
    labels.push(`identity_provider:${id}`);
  }

  return {
    appIncludes,
    policyIncludes,
    labels,
    ...(identityProviderIds.length > 0 ? { allowedIdps: identityProviderIds } : {}),
  };
}

export class ProtectedAdminHostname
  extends pulumi.ComponentResource
  implements ProtectedAdminHostnameOutputs
{
  public readonly hostname: pulumi.Output<string>;
  public readonly applicationId: pulumi.Output<string>;
  public readonly policyId: pulumi.Output<string | undefined>;
  public readonly appliedControls: pulumi.Output<string[]>;
  public readonly requiredIdentitySelectors: pulumi.Output<string[]>;

  constructor(
    name: string,
    args: ProtectedAdminHostnameArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super(PROTECTED_ADMIN_HOSTNAME_COMPONENT_TYPE, name, args as pulumi.Inputs, opts);
    assertValidTier(args.tier);
    assertHostname(args.hostname);
    assertZoneId(args.zoneId);

    const selectors = buildIdentitySelectors(args);
    const displayName = args.name ?? `${args.hostname} admin access`;
    const sessionDuration = args.sessionDuration ?? "8h";
    const inlinePolicy: cloudflare.types.input.ZeroTrustAccessApplicationPolicy = {
      name: `${displayName} allow`,
      decision: "allow",
      precedence: 1,
      includes: selectors.appIncludes,
    };

    const appArgs: cloudflare.ZeroTrustAccessApplicationArgs = {
      zoneId: args.zoneId,
      name: displayName,
      domain: args.hostname,
      type: "self_hosted",
      sessionDuration,
      httpOnlyCookieAttribute: true,
      sameSiteCookieAttribute: "strict",
      enableBindingCookie: true,
      skipInterstitial: false,
      policies: [inlinePolicy],
      ...(selectors.allowedIdps !== undefined ? { allowedIdps: selectors.allowedIdps } : {}),
    };
    const application = new cloudflare.ZeroTrustAccessApplication(`${name}-access-app`, appArgs, {
      parent: this,
    });

    const policy =
      args.accountId !== undefined
        ? new cloudflare.ZeroTrustAccessPolicy(
            `${name}-access-policy`,
            {
              accountId: args.accountId,
              name: `${displayName} allow`,
              decision: "allow",
              includes: selectors.policyIncludes,
              sessionDuration,
              ...(args.purposeJustificationRequired !== undefined
                ? { purposeJustificationRequired: args.purposeJustificationRequired }
                : {}),
            },
            { parent: this },
          )
        : undefined;

    this.hostname = pulumi.output(args.hostname);
    this.applicationId = application.id;
    this.policyId = policy === undefined ? pulumi.output(undefined) : policy.id;
    this.appliedControls = pulumi.output([
      "access_application",
      "access_inline_policy",
      ...(policy === undefined ? [] : ["access_allow_policy"]),
    ]);
    this.requiredIdentitySelectors = pulumi.output(selectors.labels);

    this.registerOutputs({
      hostname: this.hostname,
      applicationId: this.applicationId,
      policyId: this.policyId,
      appliedControls: this.appliedControls,
      requiredIdentitySelectors: this.requiredIdentitySelectors,
    });
  }
}
