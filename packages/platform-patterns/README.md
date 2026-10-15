# @hulumi/platform-patterns

Version 3.0.0 requires Node.js >=22.12.0; see the [coordinated migration notes](../../docs/release/v3.0.0-release-notes.md).

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
- `BrokeredAuroraPostgresBoundary`

```ts
import * as pulumi from "@pulumi/pulumi";
import {
  BuildProvenanceFoundation,
  CloudflareOriginIngress,
  DeploymentRepositoryFoundation,
  GitHubAwsOidcDeploymentRole,
  PulumiStateBackendFoundation,
  RunnerGovernanceFoundation,
  BrokeredAuroraPostgresBoundary,
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
  repository: "deployments",
  environment: "prod",
  reusableWorkflowRef: "kerberosmansour/deployments/.github/workflows/deploy.yml@refs/heads/main",
  audience: "sts.amazonaws.com",
  roleName: "deployments-prod-deploy",
  oidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
});

new DeploymentRepositoryFoundation("deploy-repo", {
  tier: "startup-hardened",
  owner: "kerberosmansour",
  name: "deployments",
  environments: [
    {
      name: "prod",
      requiredReviewerTeamIds: [1234],
      protectedBranches: true,
      customBranchPolicies: false,
    },
  ],
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

The deployment role requires the repository OIDC subject template
`["repo", "context", "job_workflow_ref"]`. It embeds the exact reusable
workflow in the AWS-supported `sub` condition instead of emitting an unsupported
standalone `job_workflow_ref` condition key.

`BrokeredAuroraPostgresBoundary` supplies the value-free AWS and Kubernetes
infrastructure half of a broker-mediated Aurora PostgreSQL design: four exact
workload identities, closed network paths, two `SecureSecret` containers,
restricted digest-pinned workload envelopes, admission enforcement, and an
encrypted TTL replay store. Public capability keys are supplied inline, so the
pattern creates no JWKS egress; the broker must atomically claim each `jti`
with a conditional replay-table write through an explicit DynamoDB interface
endpoint. The default rollout is inert. Broker activation requires migration
postconditions plus independently observed evidence; caller-supplied gate names
are never activation authority. Every phase rendered by this IaC-only component
remains inert. A non-infrastructure handoff may reference an external evidence
bundle only through an OCI digest and a matching SHA-256, while runtime handoff
metadata additionally requires an exact Service/namespace/Pod-selector/security-group
caller contract. Runtime and broker/migrator/rotation use exact disjoint
NodeRestriction-protected node pools, tolerations, RuntimeClasses, schedulers,
and priority classes. It does not
implement the broker,
PostgreSQL bootstrap/authority scan, rotation logic, replay semantics, or live
verification. See the
[component contract](../../docs/components/brokered-aurora-postgres-boundary.md).

Tunnel mode can front multiple public hostnames with one Cloudflare tunnel. Use `httpHostHeader` for service meshes or virtual-hosted origins that need the internal service FQDN at the origin.

Rotate historically exposed origin IPs after Cloudflare onboarding. Tunnel and allowlist+AOP patterns protect the active path, but old DNS and logs may have revealed previous origin addresses.

## Install And Import Paths

```bash
pnpm add @hulumi/platform-patterns @hulumi/baseline @pulumi/aws @pulumi/cloudflare @pulumi/github @pulumi/kubernetes @pulumi/pulumi
```

```ts
import {
  BuildProvenanceFoundation,
  CloudflareOriginIngress,
  DeploymentRepositoryFoundation,
  GitHubAwsOidcDeploymentRole,
  PulumiStateBackendFoundation,
  RunnerGovernanceFoundation,
  BrokeredAuroraPostgresBoundary,
} from "@hulumi/platform-patterns";
```

## Plan Caveats

- Cloudflare Tunnel works without requiring Enterprise-only bot features.
- Allowlist+AOP needs valid origin certificate and Authenticated Origin Pull evidence.
- GitHub protected environments require plan support in the target account/org.
- Private repository provenance may have visibility caveats for downstream attestation discovery.
- `PulumiStateBackendFoundation` emits backend posture resources and evidence; it does not migrate existing Pulumi stack state automatically.
- `RunnerGovernanceFoundation` is a governance contract and validator descriptor; use the workflow linter and live validator to compare workflows and repo settings against it.
- `BrokeredAuroraPostgresBoundary` is infrastructure only. Its `infrastructure-only-unconfigured` rotation posture must not be treated as live rotation or tenant-isolation evidence.
- Real provider testing is opt-in: `pnpm --filter @hulumi/platform-patterns test:integration` skips unless the documented GitHub and AWS edge integration env vars are set.

## Verifying SLSA Attestations

Every published tarball ships with GitHub Artifact Attestations provenance
from the reusable `sign-and-publish.yml` release lane. Verify before
installing:

```bash
npm pack --ignore-scripts @hulumi/platform-patterns@3.0.0 --pack-destination .
gh attestation verify ./hulumi-platform-patterns-3.0.0.tgz \
  --repo kerberosmansour/hulumi
```

## Unreleased CodeBuildGitHubRunner

Guardian-derived ephemeral project/webhook construction with an own-log-only
default role, explicit VPC/privilege opt-ins and bounded configured resources.
Read [operator prerequisites and qualification limits](https://github.com/kerberosmansour/hulumi/blob/main/docs/components/codebuild-github-runner.md). Not in published3.0.0; live cloud qualification remains separate.

## Using this with a coding agent

Use the [consumer integration guide](https://github.com/kerberosmansour/hulumi/blob/main/docs/agents/integration.md)
and its published-version skill reference. Check prerequisites, dependency admission
and the relevant success and failure-path tests before adopting this package.
Feedback is optional: share general usage in [Discussions](https://github.com/kerberosmansour/hulumi/discussions),
and use the [integration report](https://github.com/kerberosmansour/hulumi/issues/new?template=integration_feedback.yml)
for a concrete blocker or documentation gap. An agent must obtain operator permission
before posting. Use [private security reporting](https://github.com/kerberosmansour/hulumi/security/advisories/new)
for suspected vulnerabilities. Never share secrets, private code or transcripts.
