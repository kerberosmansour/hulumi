import type * as pulumi from "@pulumi/pulumi";

/** Public noncredential outputs for an ECR pull-through cache namespace. */
export interface EcrPullThroughCacheOutputs {
  readonly registryId: pulumi.Output<string>;
  readonly region: pulumi.Output<string>;
  readonly repositoryPrefix: pulumi.Output<string>;
  readonly upstreamRegistryUrl: pulumi.Output<string>;
  readonly cacheRegistryUri: pulumi.Output<string>;
  readonly imageReferencePrefix: pulumi.Output<string>;
}
