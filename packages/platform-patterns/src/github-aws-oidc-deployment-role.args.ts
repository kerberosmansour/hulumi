import type * as pulumi from "@pulumi/pulumi";

import type { Tier } from "./tier";

/**
 * How the GitHub OIDC `sub` claim is scoped.
 *
 * - `environment` (default / legacy): `repo:OWNER/REPO:environment:ENV`.
 *   Requires GitHub Environment protection rules to be meaningful.
 * - `ref`: `repo:OWNER/REPO:ref:<ref>` with an EXACT ref
 *   (`refs/heads/main`, or a single pinned tag `refs/tags/v1.4.2`).
 *   For plans that cannot enforce Environment protection rules (private
 *   repos return HTTP 422 setting required reviewers) — avoids the
 *   hand-rolled `StringLike` / tag-glob / `pull_request` shapes that
 *   G_OIDC_1 exists to catch.
 */
export type GitHubAwsOidcSubjectMode =
  | { readonly kind: "environment"; readonly environment: string }
  | { readonly kind: "ref"; readonly ref: string };

export interface GitHubAwsOidcDeploymentRoleArgs {
  readonly tier: Tier;
  readonly owner: string;
  readonly repository: string;
  /**
   * Legacy flat field for environment-scoped subjects. Optional now;
   * still honoured when `subjectMode` is omitted (back-compat). Prefer
   * `subjectMode: { kind: "environment", environment }`.
   */
  readonly environment?: string;
  /**
   * `job_workflow_ref` pin. Required for `environment` mode (must name a
   * workflow file and use an exact `@refs/` ref). Optional for `ref`
   * mode — when present it is still pinned into the trust condition.
   */
  readonly reusableWorkflowRef?: string;
  readonly audience: string;
  readonly roleName: pulumi.Input<string>;
  readonly oidcProviderArn: pulumi.Input<string>;
  readonly policyArns?: readonly pulumi.Input<string>[];
  readonly path?: pulumi.Input<string>;
  /**
   * Subject scoping. When omitted, falls back to `environment` mode using
   * the legacy `environment` field (back-compat). Wildcards and bare
   * `pull_request` / `pull_request_target` subjects are always rejected.
   */
  readonly subjectMode?: GitHubAwsOidcSubjectMode;
}
