---
title: Adopt hardened AWS primitives
description: Replace raw IAM roles, Secrets Manager secrets, and EC2 launch templates with Hulumi secure primitives.
---

# Adopt hardened AWS primitives

## When to use this recipe

Use this when an existing stack has hand-written IAM roles, Secrets Manager resources, or EC2 launch templates and you want safer defaults without adopting a larger platform foundation. This is an adoption checklist, not an automated migration.

## Preconditions

- You know which roles are deployment roles, workload roles, and human/admin roles.
- You have a startup-hardened permission boundary ARN for deployment/workload roles.
- You have a KMS key ARN or alias for Secrets Manager secrets.
- You can run `HulumiHardeningPack` in preview before merging.

## Steps

1. Replace GitHub deployment roles with `SecureIamDeploymentRole`.
   - Use `subjectMode: { kind: "environment", environment }` when protected GitHub Environments are available.
   - Use `subjectMode: { kind: "ref", ref: "refs/heads/main" }` only for trusted branch/tag subjects.
   - Do not use `StringLike`, wildcard refs, or `pull_request` subjects.

2. Replace workload service roles with `SecureWorkloadRole`.
   - List exact service principals.
   - Keep inline policies under the bounded cap.
   - Require a permission boundary at startup-hardened tier.

3. Replace Secrets Manager secrets with `SecureSecret`.
   - Pass a KMS key.
   - Do not create `SecretVersion` resources from source code or tests.
   - Add rotation when available; otherwise track the `rotationPosture` output.

4. Replace EC2 launch templates with `SecureLaunchTemplate`.
   - Leave metadata options at the secure default unless you are tightening them further.
   - Never set `httpTokens: "optional"`.

5. Run the policy pack.

   ```bash
   pnpm --filter @hulumi/policies build
   pnpm --filter @hulumi/policies test -- --run tests/hulumi-hardening-pack.test.ts
   ```

## Verify

- `PRIM-1` does not report wildcard GitHub OIDC trust.
- `PRIM-2` does not report broad Secrets Manager resource policies.
- `PRIM-3` does not report launch templates missing IMDSv2.
- `PRIM-4` does not report missing permission boundaries for startup-hardened secure roles.
- No secret value appears in source, tests, docs, Pulumi outputs, or logs.

## Troubleshooting

**Permission boundary missing** means the primitive is in `startup-hardened` tier. Add `permissionBoundaryArn` or use `sandbox` for ephemeral experiments.

**Wildcard OIDC rejected** means a subject axis contains `*` or a `pull_request` shape. Use a protected environment or exact `refs/*` subject.

**Secret policy rejected** means the resource policy grants `Principal: "*"` or `Resource: "*"`. Scope the principal and resource explicitly.

## See also

- [aws-secure-primitives.md](../components/aws-secure-primitives.md)
- [github-aws-oidc-deployment-role.md](../components/github-aws-oidc-deployment-role.md)
- [secure-pulumi-state-backend.md](./secure-pulumi-state-backend.md)
