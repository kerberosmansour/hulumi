# Hulumi published usage reference

Reviewed against **3.0.0**, release commit
`b1a4962f97932d335204ba3e2bbb071ebf4a2aed`. All six packages were verified on npm
with repository metadata pointing to `kerberosmansour/hulumi`.

## Choose the package

| Task                               | Package                                                                                  | Starting point                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| AWS and GitHub baseline resources  | [@hulumi/baseline](https://www.npmjs.com/package/@hulumi/baseline)                       | `SecureBucket` from `@hulumi/baseline/aws`; `SecureRepository` from `@hulumi/baseline/github` |
| Deployment policy checks           | [@hulumi/policies](https://www.npmjs.com/package/@hulumi/policies)                       | Published policy-pack entry points for the target provider                                    |
| Drift classification               | [@hulumi/drift](https://www.npmjs.com/package/@hulumi/drift)                             | Local drift classification and read-only posture validation                                   |
| Kubernetes/EKS components          | [@hulumi/k8s-baseline](https://www.npmjs.com/package/@hulumi/k8s-baseline)               | Component guides and required network/identity inputs                                         |
| Cloudflare edge components         | [@hulumi/cloudflare-baseline](https://www.npmjs.com/package/@hulumi/cloudflare-baseline) | Zone, hostname and access foundations                                                         |
| Cross-provider deployment patterns | [@hulumi/platform-patterns](https://www.npmjs.com/package/@hulumi/platform-patterns)     | `GitHubAwsOidcDeploymentRole`, state-backend and governance foundations                       |

Read the [3.0.0 manifests](https://github.com/kerberosmansour/hulumi/tree/v3.0.0/packages)
for exported subpaths, peers and engines. Baseline needs Node >=22.12.0 and compatible
Pulumi peers. Resolve exact reviewed versions without scripts, complete the
consumer's OSV/provenance admission, then install/build. Do not copy floating
installer commands from old guides.

## Private encrypted S3 bucket

Within an existing Pulumi TypeScript program with admitted dependencies:

```typescript
import { SecureBucket } from "@hulumi/baseline/aws";

export const scratch = new SecureBucket("scratch", { tier: "sandbox" });
export const bucketArn = scratch.arn;
```

This published sandbox shape creates resources if deployed. The component configures
public-access blocking, encryption, versioning and a TLS-only policy. Select the
production tier deliberately and supply its required logging/object-lock inputs.
A sandbox example is not production qualification.

Evidence: [published smoke example](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/examples/secure-bucket-smoke/index.ts)
and [component tests](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/packages/baseline/tests/secure-bucket.test.ts).
They use a mocked Pulumi runtime, not live AWS deployment. Review the generated plan
and consumer IAM boundaries before an authorized deployment.

## GitHub Actions to AWS OIDC

Use exact repository/ref identity. This example attaches no permissions policies;
add the least privilege policy required by the task after review. Replace all
example identifiers with the intended account/repository.

```typescript
import { GitHubAwsOidcDeploymentRole } from "@hulumi/platform-patterns";

export const deploymentRole = new GitHubAwsOidcDeploymentRole("deploy", {
  tier: "startup-hardened",
  owner: "example-org",
  repository: "example-app",
  audience: "sts.amazonaws.com",
  roleName: "example-app-deploy",
  oidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
  subjectMode: { kind: "ref", ref: "refs/heads/main" },
});
```

Environment-scoped mode has different protection and reusable-workflow requirements.
Inspect the [published argument contract](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/packages/platform-patterns/src/github-aws-oidc-deployment-role.args.ts)
and [trust-condition tests](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/packages/platform-patterns/tests/github-aws-oidc-deployment-role.test.ts).
Do not substitute wildcard subjects or broad admin permissions to make a preview pass.

## Scope and qualification

Use the [published component guides](https://github.com/kerberosmansour/hulumi/tree/v3.0.0/docs/components)
for Kubernetes, Cloudflare and state-backend inputs. Repository main can contain
unpublished CodeBuild, node reconciliation or Aurora work; do not advertise it as
3.0.0 functionality. Components and policy packs do not replace the consumer's
threat model, identity configuration, operational monitoring or testing.
