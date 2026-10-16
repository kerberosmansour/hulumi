import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import type {
  EcrPullThroughCacheArgs,
  EcrPullThroughCacheAuthenticatedRegistry,
  EcrPullThroughCachePublicRegistry,
} from "./ecr-pull-through-cache.args";
import type { EcrPullThroughCacheOutputs } from "./ecr-pull-through-cache.outputs";
import { assertValidTier } from "./tier";

export const ECR_PULL_THROUGH_CACHE_COMPONENT_TYPE = "hulumi:platform:EcrPullThroughCache";

const PUBLIC_UPSTREAMS: Readonly<Record<EcrPullThroughCachePublicRegistry, string>> = {
  "ecr-public": "public.ecr.aws",
  k8s: "registry.k8s.io",
  quay: "quay.io",
};
const AUTHENTICATED_UPSTREAMS: Readonly<Record<EcrPullThroughCacheAuthenticatedRegistry, string>> =
  {
    "docker-hub": "registry-1.docker.io",
    "github-container-registry": "ghcr.io",
    "gitlab-container-registry": "registry.gitlab.com",
    chainguard: "cgr.dev",
  };

const fail = (field: string): never => {
  throw new Error(`EcrPullThroughCache: invalid ${field}`);
};

interface CredentialReference {
  readonly arn: string;
  readonly region: string;
  readonly account: string;
}

interface ValidatedConfig {
  readonly registryId: string;
  readonly region: string;
  readonly repositoryPrefix: string;
  readonly upstreamRegistryUrl: string;
  readonly credential?: CredentialReference;
  readonly untaggedRetentionDays: number;
}

/** @internal Shared by runtime authority gating and deterministic unit tests. */
export function validateEcrPullThroughCacheProviderContext(
  registryId: string,
  region: string,
  providerAccount: string,
  providerRegion: string,
): void {
  if (providerAccount !== registryId || providerRegion !== region) fail("AWS provider context");
}

function parseCredentialArn(value: unknown): CredentialReference {
  const arn = typeof value === "string" ? value : fail("credentialArn");
  const match =
    /^arn:aws:secretsmanager:([a-z]{2}-[a-z0-9-]+-\d):(\d{12}):secret:(ecr-pullthroughcache\/[A-Za-z0-9/_+=.@-]+)$/.exec(
      arn,
    );
  if (match === null) return fail("credentialArn");
  const region = match[1]!;
  if (/^(cn-|us-gov-)/.test(region)) return fail("credentialArn");
  return { arn, region, account: match[2]! };
}

function validate(args: EcrPullThroughCacheArgs): ValidatedConfig {
  assertValidTier(args.tier);
  if (typeof args.registryId !== "string" || !/^\d{12}$/.test(args.registryId)) fail("registryId");
  if (
    typeof args.region !== "string" ||
    !/^[a-z]{2}-[a-z0-9-]+-\d$/.test(args.region) ||
    /^(cn-|us-gov-)/.test(args.region)
  )
    fail("region (commercial partition required)");
  if (
    typeof args.repositoryPrefix !== "string" ||
    args.repositoryPrefix.length < 2 ||
    args.repositoryPrefix.length > 30 ||
    args.repositoryPrefix === "ROOT" ||
    !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(args.repositoryPrefix)
  )
    fail("repositoryPrefix");

  const retention = args.untaggedRetentionDays ?? 14;
  if (!Number.isInteger(retention) || retention < 1 || retention > 30)
    fail("untaggedRetentionDays");

  if (args.upstream === null || typeof args.upstream !== "object") fail("upstream");
  const upstream = args.upstream as unknown as Record<string, unknown>;
  const registry = typeof upstream.registry === "string" ? upstream.registry : fail("upstream");

  if (Object.hasOwn(PUBLIC_UPSTREAMS, registry)) {
    if (Object.keys(upstream).some((key) => key !== "registry")) fail("upstream");
    return {
      registryId: args.registryId,
      region: args.region,
      repositoryPrefix: args.repositoryPrefix,
      upstreamRegistryUrl: PUBLIC_UPSTREAMS[registry as EcrPullThroughCachePublicRegistry],
      untaggedRetentionDays: retention,
    };
  }

  if (Object.hasOwn(AUTHENTICATED_UPSTREAMS, registry)) {
    if (Object.keys(upstream).some((key) => !["registry", "credentialArn"].includes(key)))
      fail("upstream");
    const credential = parseCredentialArn(upstream.credentialArn);
    if (credential.account !== args.registryId || credential.region !== args.region)
      fail("credentialArn");
    return {
      registryId: args.registryId,
      region: args.region,
      repositoryPrefix: args.repositoryPrefix,
      upstreamRegistryUrl:
        AUTHENTICATED_UPSTREAMS[registry as EcrPullThroughCacheAuthenticatedRegistry],
      credential,
      untaggedRetentionDays: retention,
    };
  }

  return fail("upstream");
}

/**
 * Creates a bounded ECR pull-through cache rule and its hardened repository
 * creation template. This is cache transport; consumers still verify image
 * digests, vulnerability policy and attestations.
 */
export class EcrPullThroughCache
  extends pulumi.ComponentResource
  implements EcrPullThroughCacheOutputs
{
  public readonly registryId: pulumi.Output<string>;
  public readonly region: pulumi.Output<string>;
  public readonly repositoryPrefix: pulumi.Output<string>;
  public readonly upstreamRegistryUrl: pulumi.Output<string>;
  public readonly cacheRegistryUri: pulumi.Output<string>;
  public readonly imageReferencePrefix: pulumi.Output<string>;

  constructor(name: string, args: EcrPullThroughCacheArgs, opts?: pulumi.ComponentResourceOptions) {
    const cfg = validate(args);
    super(ECR_PULL_THROUGH_CACHE_COMPONENT_TYPE, name, {}, opts);

    const context = pulumi
      .all([
        aws.getCallerIdentityOutput({}, { parent: this }).accountId,
        aws.getRegionOutput({}, { parent: this }).name,
      ])
      .apply(([account, region]) => {
        validateEcrPullThroughCacheProviderContext(cfg.registryId, cfg.region, account, region);
        return { account, region };
      });
    const validatedPrefix = context.apply(() => cfg.repositoryPrefix);

    const lifecyclePolicy = JSON.stringify({
      rules: [
        {
          rulePriority: 1,
          description: `Expire untagged cached images after ${cfg.untaggedRetentionDays} days`,
          selection: {
            tagStatus: "untagged",
            countType: "sinceImagePushed",
            countUnit: "days",
            countNumber: cfg.untaggedRetentionDays,
          },
          action: { type: "expire" },
        },
      ],
    });
    const template = new aws.ecr.RepositoryCreationTemplate(
      `${name}-template`,
      {
        prefix: validatedPrefix,
        region: cfg.region,
        appliedFors: ["PULL_THROUGH_CACHE"],
        description: `Hulumi pull-through cache repositories for ${cfg.repositoryPrefix}`,
        encryptionConfigurations: [{ encryptionType: "AES256" }],
        imageTagMutability: "MUTABLE",
        lifecyclePolicy,
      },
      { parent: this },
    );
    new aws.ecr.PullThroughCacheRule(
      `${name}-rule`,
      {
        ecrRepositoryPrefix: validatedPrefix,
        region: cfg.region,
        upstreamRegistryUrl: cfg.upstreamRegistryUrl,
        ...(cfg.credential === undefined ? {} : { credentialArn: cfg.credential.arn }),
      },
      { parent: this, dependsOn: [template] },
    );

    this.registryId = pulumi.output(cfg.registryId);
    this.region = pulumi.output(cfg.region);
    this.repositoryPrefix = pulumi.output(cfg.repositoryPrefix);
    this.upstreamRegistryUrl = pulumi.output(cfg.upstreamRegistryUrl);
    this.cacheRegistryUri = pulumi.output(
      `${cfg.registryId}.dkr.ecr.${cfg.region}.amazonaws.com/${cfg.repositoryPrefix}`,
    );
    this.imageReferencePrefix = this.cacheRegistryUri;
    this.registerOutputs({
      registryId: this.registryId,
      region: this.region,
      repositoryPrefix: this.repositoryPrefix,
      upstreamRegistryUrl: this.upstreamRegistryUrl,
      cacheRegistryUri: this.cacheRegistryUri,
      imageReferencePrefix: this.imageReferencePrefix,
    });
  }
}
