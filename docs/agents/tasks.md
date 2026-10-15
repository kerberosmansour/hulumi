# Hulumi consumer task contracts

These tasks target published **3.0.0**, Node.js **>=22.12.0**, and the peer ranges
in each published package manifest. The private workspace root version is not a
release identifier. Resolve an exact consumer lockfile with scripts disabled,
complete OSV/provenance review, then use the existing project's typecheck and
mock tests. Cloud operations require a separately authorized environment.
See [the published usage reference](../../skills/hulumi-secure-pulumi/references/usage.md)
for registry links and the first two minimal examples. Each task uses the optional
[feedback workflow](feedback.md); reporting is never required.

## 1. Create a private encrypted S3 bucket

Package: `@hulumi/baseline@3.0.0`, import `@hulumi/baseline/aws`.
Use the SecureBucket sandbox example in the usage reference. Suitable for AWS S3
in a Pulumi TypeScript stack; not a substitute for application access control.
Use synthetic bucket names and an explicit tier. Verify the resource graph's
public-access block, encryption, TLS policy and expected outputs with mocks.
Reject a configuration that weakens the required posture. The sandbox and
startup-hardened tiers create different resources: inspect the
[versioned tier guide](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/docs/tiers.md).
A passing mock is not proof of deployed AWS posture. If configuration fails,
check the exact constructor and tier before changing policy.

## 2. Configure GitHub-to-AWS deployment identity

Package: `@hulumi/platform-patterns@3.0.0`; use the exact-ref
GitHubAwsOidcDeploymentRole example in the usage reference. Suitable for a defined
repository/ref and reviewed AWS trust boundary. Keep permissions empty until the
application's required actions/resources have been reviewed. Verify the exact
subject, audience and repository scope; reject wildcard/admin shortcuts.
AWS role and GitHub workflow configuration remain operator responsibilities.
Inspect the [published example evidence](https://github.com/kerberosmansour/hulumi/tree/v3.0.0/packages/platform-patterns/tests)
before altering an issuer or subject to resolve a denied request.

## 3. Diagnose a hardening-policy failure

Package: `@hulumi/policies@3.0.0` and its declared `@pulumi/policy` peer.
Use the [published policy rollout cookbook](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/docs/cookbooks/policy-pack-rollout.md).
Start with one failing synthetic resource and retain its rule ID, exact property
and tier. Compare the resource with the matching published rule/test, correct the
configuration, and verify both rejecting and accepted fixtures. Do not disable the
pack or broaden a suppression to make a preview pass. An exception needs its own
reviewed rationale, scope and expiry. Policy results alone do not establish live
cloud state. If the rule appears wrong, prepare a minimal report with expected and
observed properties; no account IDs, stack exports or credentials.

## 4. Configure a private GitHub repository safely

Package: `@hulumi/baseline@3.0.0`; import `@hulumi/baseline/github`.
Minimal declaration from the [published smoke program](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/examples/secure-repository-smoke/index.ts):

```ts
import { SecureRepository } from "@hulumi/baseline/github";

const repository = new SecureRepository("synthetic-repository", {
  tier: "sandbox",
  visibility: "private",
  description: "Synthetic integration test",
});
```

Verify mocked repository visibility and ruleset behavior before any GitHub change.
For adoption, inspect the published component's existing-repository/ruleset arguments
and the [smoke tests](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/examples/secure-repository-smoke/tests/smoke.test.ts).
Do not apply the creation example to a real existing repository without an adoption
preview and approval. Public visibility needs explicit opt-in; provider permissions
and GitHub plan availability can constrain hardening features. Resolve those limits
explicitly instead of silently weakening controls.

## 5. Prepare an encrypted Pulumi state backend

Package: `@hulumi/platform-patterns@3.0.0`; import from that package.
Minimal constructor from the [published smoke program](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/examples/pulumi-state-backend-foundation-smoke/index.ts):

```ts
import { PulumiStateBackendFoundation } from "@hulumi/platform-patterns";

const backend = new PulumiStateBackendFoundation("synthetic-state", {
  tier: "startup-hardened",
  bucketName: "replace-with-authorized-unique-name",
  kmsAliasName: "alias/hulumi/state/example",
  enableLeaseTable: true,
  objectLock: true,
});
```

Verify encryption, TLS requirements, outputs and tier behavior with the
[published smoke tests](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/examples/pulumi-state-backend-foundation-smoke/tests/smoke.test.ts).
S3, KMS and retention/locking can create costs and durable operational constraints.
Do not deploy or migrate real state without reviewed permissions, backup/recovery
and explicit authorization. The component's backend URL/secrets-provider hint does
not migrate state or qualify disaster recovery. On failure, consult the
[versioned backend guide](https://github.com/kerberosmansour/hulumi/blob/v3.0.0/docs/components/pulumi-state-backend-foundation.md)
and preserve the existing backend until the migration plan is verified.
