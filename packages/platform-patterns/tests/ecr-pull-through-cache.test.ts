import * as pulumi from "@pulumi/pulumi";
import { afterEach, describe, expect, it } from "vitest";
import { registrations, resetRegistrations, settlePulumi, valueOf } from "./setup";

const valid = {
  tier: "startup-hardened",
  registryId: "123456789012",
  region: "eu-west-2",
  repositoryPrefix: "trusted-images",
  upstream: { registry: "ecr-public" },
};

async function construct(overrides: Record<string, unknown> = {}) {
  const mod = (await import("../src")) as unknown as Record<string, unknown>;
  expect(mod.EcrPullThroughCache).toBeTypeOf("function");
  const Constructor = mod.EcrPullThroughCache as new (
    name: string,
    args: Record<string, unknown>,
  ) => {
    registryId: pulumi.Output<string>;
    region: pulumi.Output<string>;
    repositoryPrefix: pulumi.Output<string>;
    upstreamRegistryUrl: pulumi.Output<string>;
    cacheRegistryUri: pulumi.Output<string>;
    imageReferencePrefix: pulumi.Output<string>;
  };
  return new Constructor("test-cache", { ...valid, ...overrides });
}

describe("EcrPullThroughCache", () => {
  afterEach(resetRegistrations);

  it("registers a matching hardened template before a public ECR cache rule", async () => {
    const cache = await construct();
    expect(await valueOf(cache.cacheRegistryUri)).toBe(
      "123456789012.dkr.ecr.eu-west-2.amazonaws.com/trusted-images",
    );
    await settlePulumi();

    const templateIndex = registrations.findIndex(
      (r) => r.type === "aws:ecr/repositoryCreationTemplate:RepositoryCreationTemplate",
    );
    const ruleIndex = registrations.findIndex(
      (r) => r.type === "aws:ecr/pullThroughCacheRule:PullThroughCacheRule",
    );
    expect(templateIndex).toBeGreaterThan(-1);
    expect(ruleIndex).toBeGreaterThan(templateIndex);

    const template = registrations[templateIndex]!.inputs;
    expect(template).toMatchObject({
      prefix: "trusted-images",
      region: "eu-west-2",
      appliedFors: ["PULL_THROUGH_CACHE"],
      encryptionConfigurations: [{ encryptionType: "AES256" }],
      imageTagMutability: "MUTABLE",
    });
    expect(JSON.parse(template.lifecyclePolicy as string)).toEqual({
      rules: [
        {
          rulePriority: 1,
          description: "Expire untagged cached images after 14 days",
          selection: {
            tagStatus: "untagged",
            countType: "sinceImagePushed",
            countUnit: "days",
            countNumber: 14,
          },
          action: { type: "expire" },
        },
      ],
    });
    expect(registrations[ruleIndex]!.inputs).toMatchObject({
      region: "eu-west-2",
      ecrRepositoryPrefix: "trusted-images",
      upstreamRegistryUrl: "public.ecr.aws",
    });
    expect(registrations[ruleIndex]!.inputs.credentialArn).toBeUndefined();
  });

  it.each([
    ["docker-hub", "registry-1.docker.io"],
    ["github-container-registry", "ghcr.io"],
    ["gitlab-container-registry", "registry.gitlab.com"],
    ["chainguard", "cgr.dev"],
  ])("maps authenticated %s to its fixed upstream URL", async (registry, url) => {
    const cache = await construct({
      upstream: {
        registry,
        credentialArn:
          "arn:aws:secretsmanager:eu-west-2:123456789012:secret:ecr-pullthroughcache/upstream-AbCdEf",
      },
    });
    await valueOf(cache.imageReferencePrefix);
    await settlePulumi();
    const rule = registrations.find(
      (r) => r.type === "aws:ecr/pullThroughCacheRule:PullThroughCacheRule",
    )!.inputs;
    expect(rule).toMatchObject({
      ecrRepositoryPrefix: "trusted-images",
      upstreamRegistryUrl: url,
      credentialArn:
        "arn:aws:secretsmanager:eu-west-2:123456789012:secret:ecr-pullthroughcache/upstream-AbCdEf",
    });
  });

  it.each(["k8s", "quay"])("maps public %s without a credential", async (registry) => {
    const cache = await construct({ upstream: { registry } });
    await valueOf(cache.upstreamRegistryUrl);
    await settlePulumi();
    const rule = registrations.find(
      (r) => r.type === "aws:ecr/pullThroughCacheRule:PullThroughCacheRule",
    )!.inputs;
    expect(rule.credentialArn).toBeUndefined();
    expect(rule.upstreamRegistryUrl).toBe(registry === "k8s" ? "registry.k8s.io" : "quay.io");
  });

  it.each([
    { repositoryPrefix: "ROOT" },
    { repositoryPrefix: "a" },
    { repositoryPrefix: "a".repeat(31) },
    { repositoryPrefix: "trusted/images" },
    { repositoryPrefix: "trusted-" },
    { repositoryPrefix: "Trusted" },
    { registryId: "1234" },
    { region: "us-gov-west-1" },
    { region: "cn-north-1" },
    { untaggedRetentionDays: 0 },
    { untaggedRetentionDays: 31 },
    { untaggedRetentionDays: 1.5 },
  ])(
    "rejects broad or malformed static configuration before child registration: %j",
    async (args) => {
      await expect(construct(args)).rejects.toThrow(/EcrPullThroughCache/);
      await settlePulumi();
      expect(registrations.filter((r) => r.type.startsWith("aws:ecr/"))).toHaveLength(0);
    },
  );

  it.each([
    { registry: "dhi", url: "dhi.io" },
    { registry: "azure-container-registry" },
    { registry: "custom", url: "attacker.example" },
    { registry: "ecr", accountId: "999999999999" },
  ])("rejects unsupported upstream authority before child registration: %j", async (upstream) => {
    await expect(construct({ upstream })).rejects.toThrow(/EcrPullThroughCache/);
    await settlePulumi();
    expect(registrations.filter((r) => r.type.startsWith("aws:ecr/"))).toHaveLength(0);
  });

  it.each([
    "plaintext",
    "arn:aws-cn:secretsmanager:eu-west-2:123456789012:secret:ecr-pullthroughcache/a",
    "arn:aws:iam:eu-west-2:123456789012:secret:ecr-pullthroughcache/a",
    "arn:aws:secretsmanager:eu-west-2:123456789012:secret:unrelated/a",
  ])(
    "rejects malformed credential references without registering children",
    async (credentialArn) => {
      await expect(
        construct({ upstream: { registry: "docker-hub", credentialArn } }),
      ).rejects.toThrow(/EcrPullThroughCache: invalid credentialArn/);
      await settlePulumi();
      expect(registrations.filter((r) => r.type.startsWith("aws:ecr/"))).toHaveLength(0);
    },
  );

  it.each([
    "arn:aws:secretsmanager:us-east-1:123456789012:secret:ecr-pullthroughcache/a-AbCdEf",
    "arn:aws:secretsmanager:eu-west-2:999999999999:secret:ecr-pullthroughcache/a-AbCdEf",
  ])(
    "fails closed on credential/provider context mismatch before provider mutation",
    async (credentialArn) => {
      await expect(
        construct({ upstream: { registry: "docker-hub", credentialArn } }),
      ).rejects.toThrow(/EcrPullThroughCache: invalid credentialArn/);
      await settlePulumi();
      expect(registrations.filter((r) => r.type.startsWith("aws:ecr/"))).toHaveLength(0);
    },
  );

  it.each([
    ["999999999999", "eu-west-2"],
    ["123456789012", "us-east-1"],
  ])("rejects an AWS provider outside the declared target: %s/%s", async (account, region) => {
    const mod = await import("../src/ecr-pull-through-cache");
    expect(() =>
      mod.validateEcrPullThroughCacheProviderContext("123456789012", "eu-west-2", account, region),
    ).toThrow(/EcrPullThroughCache: invalid AWS provider context/);
    expect(registrations.filter((r) => r.type.startsWith("aws:ecr/"))).toHaveLength(0);
  });

  it("exports only noncredential context and creates no authority resources", async () => {
    const cache = await construct({ untaggedRetentionDays: 30 });
    expect(await valueOf(cache.registryId)).toBe("123456789012");
    expect(await valueOf(cache.region)).toBe("eu-west-2");
    expect(await valueOf(cache.repositoryPrefix)).toBe("trusted-images");
    expect(await valueOf(cache.upstreamRegistryUrl)).toBe("public.ecr.aws");
    expect(await valueOf(cache.imageReferencePrefix)).toBe(
      "123456789012.dkr.ecr.eu-west-2.amazonaws.com/trusted-images",
    );
    await settlePulumi();
    expect(Object.keys(cache)).not.toContain("credentialArn");
    const children = registrations.filter((r) => r.type !== "hulumi:platform:EcrPullThroughCache");
    expect(children.every((r) => r.type.startsWith("aws:ecr/"))).toBe(true);
    expect(children.some((r) => /iam|policy|secret/i.test(r.type))).toBe(false);
  });
});
