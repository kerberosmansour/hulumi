# ECR pull-through cache (unreleased)

`EcrPullThroughCache` creates one bounded Amazon ECR pull-through cache rule and
a matching repository creation template. The source capability is additive to
`@hulumi/platform-patterns` and is not part of the immutable 3.0.0 npm release.

```ts
import { EcrPullThroughCache } from "@hulumi/platform-patterns";

const cache = new EcrPullThroughCache("public-base-images", {
  tier: "startup-hardened",
  registryId: "123456789012",
  region: "eu-west-2",
  repositoryPrefix: "trusted-base",
  upstream: { registry: "ecr-public" },
  untaggedRetentionDays: 14,
});

export const imagePrefix = cache.imageReferencePrefix;
```

The selected AWS provider must resolve to the exact `registryId` and `region`.
The component checks that context before either ECR resource is registered. Only
the commercial AWS partition is supported by this initial URI and secret-ARN
contract. `repositoryPrefix` must be 2–30 lowercase characters using bounded
`.`/`_`/`-` separators. `ROOT`, slash-separated namespaces and trailing
separators are rejected.

Supported unauthenticated upstreams are:

| Discriminator | Fixed upstream URL |
| ------------- | ------------------ |
| `ecr-public`  | `public.ecr.aws`   |
| `k8s`         | `registry.k8s.io`  |
| `quay`        | `quay.io`          |

Supported authenticated upstreams are:

| Discriminator               | Fixed upstream URL     |
| --------------------------- | ---------------------- |
| `docker-hub`                | `registry-1.docker.io` |
| `github-container-registry` | `ghcr.io`              |
| `gitlab-container-registry` | `registry.gitlab.com`  |
| `chainguard`                | `cgr.dev`              |

Authenticated upstreams require an existing Secrets Manager ARN in the exact
target account and region, with a secret name beginning
`ecr-pullthroughcache/`. The component accepts the ARN reference only; it never
reads, returns or logs the credential value and never creates a secret. Populate
the secret using the upstream-specific structure required by the
[AWS ECR pull-through cache documentation](https://docs.aws.amazon.com/AmazonECR/latest/userguide/pull-through-cache.html).

Direct `dhi.io`, Azure Container Registry, arbitrary URLs and cross-account ECR
are not accepted. Docker Hardened Images can use a Docker Hub organization
mirror where the applicable Docker subscription permits it, or a separately
reviewed copy workflow that preserves the required attestations. Do not infer
attestation preservation from an ordinary image copy.

The repository creation template:

- applies only to `PULL_THROUGH_CACHE`;
- uses AES-256 encryption;
- keeps tags `MUTABLE`, which ECR needs to refresh cached tags; and
- expires only untagged images after 1–30 days, defaulting to 14.

The template is a dependency of the rule. It creates no custom role, IAM policy,
registry policy, KMS key or resource tags. Consumers still need explicit ECR
authentication and pull/cache permissions. Template updates do not retrofit
repositories already created from an older template, and deleting the template
or rule does not by itself prove all cached repositories were removed.

Public outputs are `registryId`, `region`, `repositoryPrefix`,
`upstreamRegistryUrl`, `cacheRegistryUri` and `imageReferencePrefix`. There is no
credential output.

Pull-through caching is transport and availability behavior. It does not verify
image signatures, attestations, provenance or vulnerability policy. AWS can
serve the last cached image when an upstream refresh fails. Consumers should use
digest-pinned image references, scan imported content, verify attestations, and
monitor cache freshness and tagged-image growth. The untagged lifecycle rule is
not a total storage or cost cap.

Local evidence exercises the exported constructor and real Pulumi registration
inputs with provider transport mocked. An authenticated sandbox preview, create,
pull, refresh-failure observation and destroy are deferred to the operations
qualification milestone; no live AWS resource or publication claim is made here.
