import type { Tier } from "./tier";

export type EcrPullThroughCachePublicRegistry = "ecr-public" | "k8s" | "quay";
export type EcrPullThroughCacheAuthenticatedRegistry =
  "docker-hub" | "github-container-registry" | "gitlab-container-registry" | "chainguard";

export type EcrPullThroughCacheUpstream =
  | {
      readonly registry: EcrPullThroughCachePublicRegistry;
    }
  | {
      readonly registry: EcrPullThroughCacheAuthenticatedRegistry;
      /** Existing AWS Secrets Manager ARN; the secret value never enters this component. */
      readonly credentialArn: string;
    };

/** Configuration for one bounded ECR pull-through cache namespace. */
export interface EcrPullThroughCacheArgs {
  readonly tier: Tier;
  /** Exact commercial AWS account that owns the target private ECR registry. */
  readonly registryId: string;
  /** Exact commercial AWS region used by both ECR resources. */
  readonly region: string;
  /** Explicit ECR namespace; ROOT and nested/slash-separated prefixes are rejected. */
  readonly repositoryPrefix: string;
  readonly upstream: EcrPullThroughCacheUpstream;
  /** Cleanup for untagged cached images only. Tagged-image growth is not bounded here. */
  readonly untaggedRetentionDays?: number;
}
