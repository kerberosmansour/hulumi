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
  /**
   * Identity providers users may select when authenticating to the application.
   * This constrains login routing and does not authorize a user. At least one
   * email, email domain, or Access group authorization selector is still required.
   */
  readonly allowedIdentityProviderIds?: readonly string[];
  readonly sessionDuration?: pulumi.Input<string>;
  readonly purposeJustificationRequired?: boolean;
}
