# AWS Secure Primitives

`@hulumi/baseline/aws` includes hardened building blocks for IAM roles, Secrets Manager secrets, and EC2 launch templates:

- `SecureIamDeploymentRole`
- `SecureWorkloadRole`
- `SecureSecret`
- `SecureLaunchTemplate`

These primitives are for cases where `AccountFoundation`, `SecureBucket`, or platform-level patterns are too broad, but raw AWS resources would make unsafe trust, secret, or metadata posture too easy to express.

## Defaults

| Primitive                 | Guardrail                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SecureIamDeploymentRole` | Exact GitHub OIDC `StringEquals` trust, no wildcard subject axes, optional policy attachments, bounded inline policies, required permission boundary at `startup-hardened`. |
| `SecureWorkloadRole`      | Explicit AWS service principals only, no wildcard principal, bounded inline policies, required permission boundary at `startup-hardened`.                                   |
| `SecureSecret`            | KMS key required, no secret value/version creation, optional resource policy rejected if broad, rotation posture surfaced as an output.                                     |
| `SecureLaunchTemplate`    | IMDSv2 required by default and enforced if callers pass metadata options.                                                                                                   |

## Example

```ts
import { SecureIamDeploymentRole, SecureLaunchTemplate, SecureSecret } from "@hulumi/baseline/aws";

const boundary = "arn:aws:iam::111122223333:policy/hulumi-permission-boundary";

export const deployRole = new SecureIamDeploymentRole("deploy", {
  tier: "startup-hardened",
  owner: "acme",
  repository: "platform",
  roleName: "acme-platform-deploy",
  oidcProviderArn: "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com",
  audience: "sts.amazonaws.com",
  subjectMode: { kind: "ref", ref: "refs/heads/main" },
  permissionBoundaryArn: boundary,
});

export const appSecret = new SecureSecret("app-secret", {
  tier: "startup-hardened",
  secretName: "app/prod",
  kmsKeyId: "arn:aws:kms:us-east-1:111122223333:key/1234abcd",
  rotation: { enabled: true },
});

export const launchTemplate = new SecureLaunchTemplate("app-lt", {
  tier: "startup-hardened",
  namePrefix: "app-",
  imageId: "ami-1234567890abcdef0",
  instanceType: "t3.micro",
});
```

## Policy Backstops

`HulumiHardeningPack` adds four primitive rules:

| Rule     | Check                                                                                |
| -------- | ------------------------------------------------------------------------------------ |
| `PRIM-1` | GitHub OIDC AWS role trust must not use wildcard or `StringLike` subject conditions. |
| `PRIM-2` | Secrets Manager resource policies must not grant broad principal or resource access. |
| `PRIM-3` | EC2 launch templates must require IMDSv2.                                            |
| `PRIM-4` | Startup-Hardened secure IAM primitive roles must use a permission boundary.          |

## Related Controls

Control references remain identifier-only: `CCM:IAM-02`, `NIST-800-53-r5:AC-6`, `NIST-800-53-r5:CM-6`, `NIST-800-218A:PO.5`, `NIST-SSDF-v1.1:PW.6`.
