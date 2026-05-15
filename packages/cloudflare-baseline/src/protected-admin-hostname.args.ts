import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

export interface ProtectedAdminHostnameArgs {
  readonly tier: Tier;
  readonly zoneId: pulumi.Input<string>;
  readonly accountId?: pulumi.Input<string>;
  readonly hostname: string;
  readonly name?: string;
  readonly allowedEmails?: readonly string[];
  readonly allowedEmailDomains?: readonly string[];
  readonly allowedAccessGroupIds?: readonly string[];
  readonly allowedIdentityProviderIds?: readonly string[];
  readonly sessionDuration?: pulumi.Input<string>;
  readonly purposeJustificationRequired?: boolean;
}
