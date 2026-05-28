# @hulumi/platform-patterns

Cross-provider Pulumi patterns for Cloudflare edge ingress, AWS deployment identity,
secure Pulumi state backends, GitHub deployment repositories, build provenance, and
runner governance.

The package currently includes:

- `CloudflareOriginIngress`
- `GitHubAwsOidcDeploymentRole`
- `DeploymentRepositoryFoundation`
- `BuildProvenanceFoundation`
- `PulumiStateBackendFoundation`
- `RunnerGovernanceFoundation`

```ts
import * as pulumi from "@pulumi/pulumi";
import {
  BuildProvenanceFoundation,
  CloudflareOriginIngress,
  DeploymentRepositoryFoundation,
  GitHubAwsOidcDeploymentRole,
  PulumiStateBackendFoundation,
  RunnerGovernanceFoundation,
} from "@hulumi/platform-patterns";

new CloudflareOriginIngress("edge", {
  tier: "startup-hardened",
  mode: "tunnel",
  cloudflareAccountId: "acct_123",
  hostname: "app.example.com",
  service: "http://app.default.svc.cluster.local:8080",
  httpHostHeader: "app.default.svc.cluster.local",
  additionalRoutes: [
    {
      hostname: "api.example.com",
      service: "http://api.default.svc.cluster.local:8080",
      httpHostHeader: "api.default.svc.cluster.local",
      runtime: { kind: "eks", automation: "managed-contract" },
    },
  ],
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

new PulumiStateBackendFoundation("state", {
  tier: "startup-hardened",
  bucketName: "my-org-pulumi-state",
  kmsAliasName: "alias/hulumi-pulumi-state",
  enableLeaseTable: true,
});

new RunnerGovernanceFoundation("runners", {
  tier: "startup-hardened",
  owner: "kerberosmansour",
  repository: "hulumi",
  environments: [
    {
      name: "prod",
      requiredReviewers: true,
      protectedBranches: true,
    },
  ],
  privilegedWorkflows: [
    {
      workflowPath: ".github/workflows/deploy.yml",
      jobName: "deploy",
      environmentName: "prod",
      runsOn: ["ubuntu-latest"],
    },
  ],
});
```

Tunnel mode can front multiple public hostnames with one Cloudflare tunnel. Use `httpHostHeader` for service meshes or virtual-hosted origins that need the internal service FQDN at the origin.

Rotate historically exposed origin IPs after Cloudflare onboarding. Tunnel and allowlist+AOP patterns protect the active path, but old DNS and logs may have revealed previous origin addresses.

## Install And Import Paths

```bash
pnpm add @hulumi/platform-patterns @hulumi/baseline @pulumi/aws @pulumi/cloudflare @pulumi/github @pulumi/pulumi
```

```ts
import {
  BuildProvenanceFoundation,
  CloudflareOriginIngress,
  DeploymentRepositoryFoundation,
  GitHubAwsOidcDeploymentRole,
  PulumiStateBackendFoundation,
  RunnerGovernanceFoundation,
} from "@hulumi/platform-patterns";
```

## Plan Caveats

- Cloudflare Tunnel works without requiring Enterprise-only bot features.
- Allowlist+AOP needs valid origin certificate and Authenticated Origin Pull evidence.
- GitHub protected environments require plan support in the target account/org.
- Private repository provenance may have visibility caveats for downstream attestation discovery.
- `PulumiStateBackendFoundation` emits backend posture resources and evidence; it does not migrate existing Pulumi stack state automatically.
- `RunnerGovernanceFoundation` is a governance contract and validator descriptor; use the workflow linter and live validator to compare workflows and repo settings against it.
- Real provider testing is opt-in: `pnpm --filter @hulumi/platform-patterns test:integration` skips unless the documented GitHub and AWS edge integration env vars are set.

## Verifying SLSA Attestations

Every published tarball ships with GitHub Artifact Attestations provenance
from the reusable `sign-and-publish.yml` release lane. Verify before
installing:

```bash
pnpm pack @hulumi/platform-patterns@1.5.0 --pack-destination .
gh attestation verify ./hulumi-platform-patterns-1.5.0.tgz \
  --repo kerberosmansour/hulumi
```
