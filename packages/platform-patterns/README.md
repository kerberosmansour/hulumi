# @hulumi/platform-patterns

Cross-provider Pulumi patterns for Cloudflare edge ingress, AWS deployment identity, and GitHub deployment repositories.

M3 introduces:

- `CloudflareOriginIngress`
- `GitHubAwsOidcDeploymentRole`
- `DeploymentRepositoryFoundation`
- `BuildProvenanceFoundation`

```ts
import * as pulumi from "@pulumi/pulumi";
import {
  BuildProvenanceFoundation,
  CloudflareOriginIngress,
  DeploymentRepositoryFoundation,
  GitHubAwsOidcDeploymentRole,
} from "@hulumi/platform-patterns";

new CloudflareOriginIngress("edge", {
  tier: "startup-hardened",
  mode: "tunnel",
  cloudflareAccountId: "acct_123",
  hostname: "app.example.com",
  service: "http://app.default.svc.cluster.local:8080",
  tunnelSecret: pulumi.secret("base64-tunnel-secret"),
  runtime: { kind: "eks", automation: "managed-contract" },
});

new GitHubAwsOidcDeploymentRole("deploy", {
  tier: "startup-hardened",
  owner: "kerberosmansour",
  repository: "hulumi",
  environment: "prod",
  reusableWorkflowRef: "kerberosmansour/hulumi/.github/workflows/deploy.yml@refs/heads/main",
  audience: "sts.amazonaws.com",
  roleName: "hulumi-prod-deploy",
  oidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
});

new DeploymentRepositoryFoundation("deploy-repo", {
  tier: "startup-hardened",
  owner: "kerberosmansour",
  name: "deployments",
});

new BuildProvenanceFoundation("provenance", {
  tier: "startup-hardened",
  artifactName: "dist/**",
});
```

Rotate historically exposed origin IPs after Cloudflare onboarding. Tunnel and allowlist+AOP patterns protect the active path, but old DNS and logs may have revealed previous origin addresses.

## Install And Import Paths

```bash
pnpm add @hulumi/platform-patterns @hulumi/baseline @pulumi/aws@7.27.0 @pulumi/cloudflare@6.15.0 @pulumi/github@6.13.1 @pulumi/pulumi@3.232.0
```

```ts
import {
  BuildProvenanceFoundation,
  CloudflareOriginIngress,
  DeploymentRepositoryFoundation,
  GitHubAwsOidcDeploymentRole,
} from "@hulumi/platform-patterns";
```

## Plan Caveats

- Cloudflare Tunnel works without requiring Enterprise-only bot features.
- Allowlist+AOP needs valid origin certificate and Authenticated Origin Pull evidence.
- GitHub protected environments require plan support in the target account/org.
- Private repository provenance may have visibility caveats for downstream attestation discovery.
- Real provider testing is opt-in: `pnpm --filter @hulumi/platform-patterns test:integration` skips unless the documented GitHub and AWS edge integration env vars are set.

## Verifying SLSA Attestations

Every published tarball ships with `actions/attest-build-provenance` v2
provenance. Verify before installing:

```bash
pnpm pack @hulumi/platform-patterns@1.3.1 --pack-destination .
gh attestation verify ./hulumi-platform-patterns-1.3.1.tgz \
  --repo kerberosmansour/hulumi
```
