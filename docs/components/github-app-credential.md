---
title: GitHubAppCredential
description: Provisions a KMS-encrypted GitHub App secret and a private, scope-enforcing Lambda token broker. Runtime callers can invoke the broker but cannot read or export the App private key.
---

# `GitHubAppCredential`

`@hulumi/k8s-baseline.GitHubAppCredential` provisions:

1. An `aws.secretsmanager.Secret` encrypted with the consumer-supplied `kmsKeyAlias`.
2. A private Lambda broker with an explicit execution role. Only this role can read the exact secret, decrypt it through Secrets Manager with the exact KMS key and secret encryption context, and write to its exact log group.
3. An `aws.iam.Policy` that grants only `lambda:InvokeFunction` on the exact broker function.
4. An optional `aws.iam.RolePolicyAttachment` that links the invoke-only policy to a supplied runtime role.

The runtime role never receives `secretsmanager:GetSecretValue` or `kms:Decrypt`. A compromised build cannot export the private key, sign an App JWT, or bypass the component's repository and permission policy.

The component canonicalizes `repos` and `permissions`, stores their SHA-256 digest in the `hulumi:github-app-scope-sha256` secret tag, and serializes the same bounded scope into the broker. The out-of-band population helper requires this digest before writing. On every invocation, the broker validates the caller's target before secret retrieval, validates the stored scope and digest before signing, requests exactly one repository and the configured non-empty permissions, and verifies GitHub's returned repositories and permissions before returning a token.

## Inputs and outputs

- `repos`: non-empty `owner/name` allowlist. `['*']` permits selecting any installed repository while each minted token remains restricted to one requested repository.
- `permissions`: non-empty GitHub App permission map using `read`, `write`, or `admin` values.
- `kmsKeyAlias`: required customer-managed KMS alias used by Secrets Manager.
- `kmsKeyArn`: optional exact key ARN for the broker policy. When omitted, Pulumi resolves `kmsKeyAlias` to its target key ARN.
- `secretName`: optional Secrets Manager name.
- `iamPrincipalArn`: optional runtime role that receives the invoke-only policy.
- `secretArn`: operator-facing secret container ARN. Do not grant it to runtime callers.
- `brokerFunctionArn` / `brokerFunctionName`: broker targets for IAM and the mint helper.
- `iamInvokePolicyArn`: invoke-only runtime policy.
- `iamReadPolicyArn`: deprecated compatibility alias for `iamInvokePolicyArn`; it no longer grants secret access.
- `scopeDigest`: non-secret canonical scope digest.

The component rejects duplicate or mixed-wildcard repositories, malformed names, empty scope, more than 500 repositories, more than 100 permissions, or a canonical scope above 16 KiB. The broker also limits secret and provider response sizes, uses a 10-second HTTP timeout, accepts JSON responses only, and emits bounded reason-only failures.

## Populate and mint

The package ships two executable scripts in `node_modules/@hulumi/k8s-baseline/scripts/`.

Populate once through a trusted operator path:

```bash
node_modules/@hulumi/k8s-baseline/scripts/populate-github-app-secret.sh \
  private-deps-github-app \
  123456 \
  ./github-app.private-key.pem \
  '["example/private-dependency"]' \
  '{"contents":"read"}'
```

The operator needs `secretsmanager:DescribeSecret`, `secretsmanager:PutSecretValue`, and the KMS permissions required to write the encrypted secret. The helper validates the component-owned scope tag before writing and scrubs its private temporary file.

Mint through the broker from CI:

```bash
node_modules/@hulumi/k8s-baseline/scripts/mint-github-app-token.sh \
  "$BROKER_FUNCTION_NAME" \
  example \
  private-dependency
```

The helper invokes Lambda with `{owner, repository}`, refuses Lambda function errors or malformed/oversized responses, prints only the validated installation token to stdout, and scrubs its response file. It does not call Secrets Manager, OpenSSL, or GitHub.

### Migration from the direct-read policy

1. Deploy the updated component and attach `iamInvokePolicyArn` to the runtime role. Existing `iamPrincipalArn` users receive this attachment automatically.
2. Replace the mint helper's first argument: use `brokerFunctionName` or `brokerFunctionArn` instead of `secretArn`.
3. Remove every independently managed runtime permission for `secretsmanager:GetSecretValue`, `secretsmanager:DescribeSecret`, `kms:Decrypt`, and secret-tag mutation. The component cannot revoke authority granted elsewhere.
4. Keep secret population in a separate trusted operator role. Runtime jobs need only `lambda:InvokeFunction` on the broker ARN.

Both broker calls use fixed `https://api.github.com` endpoints, redirect refusal, a 10-second timeout, and `X-GitHub-Api-Version: 2026-03-10`. The broker never logs the private key, App JWT, authorization header, or installation token.

Source: [packages/k8s-baseline/src/github-app-credential.ts](../../packages/k8s-baseline/src/github-app-credential.ts) and [packages/k8s-baseline/scripts/](../../packages/k8s-baseline/scripts/).

Provider references: [GitHub installation token endpoint](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app), [AWS Secrets Manager `GetSecretValue`](https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html), [AWS Lambda execution roles](https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html), and [Pulumi `CallbackFunction`](https://www.pulumi.com/registry/packages/aws/api-docs/lambda/callbackfunction/).
