---
title: GitHubAppCredential
description: Provisions an AWS Secrets Manager container + scoped IAM read policy for a GitHub App's credential. Ships populate-github-app-secret.sh + mint-github-app-token.sh in the npm tarball for build-time use under BuildKit's --mount=type=secret pattern.
---

# `GitHubAppCredential`

`@hulumi/k8s-baseline.GitHubAppCredential` — provisions:

1. An `aws.secretsmanager.Secret` encrypted with the consumer-supplied `kmsKeyAlias`.
2. An `aws.iam.Policy` with `secretsmanager:GetSecretValue` + `secretsmanager:DescribeSecret` scoped to **the single SM ARN** (never `*`).
3. (Optional) An `aws.iam.RolePolicyAttachment` linking the policy to a supplied principal ARN.

The component canonicalizes `repos` and `permissions`, stores their SHA-256 digest in the
`hulumi:github-app-scope-sha256` secret tag, and exposes the same non-secret value as
`scopeDigest`. The tag binds the reviewed Pulumi declaration to secret population and every
token request. Changing scope updates the tag; token minting then fails closed until the secret
is populated again with the new matching scope.

The component does **not** mint tokens. Tokens are minted at build time, inside `docker build`, via the BuildKit secret-mount pattern. The package ships two user-facing executable scripts at `node_modules/@hulumi/k8s-baseline/scripts/`:

- **`populate-github-app-secret.sh <SECRET_ID> <APP_ID> <PEM_PATH> <REPOS_JSON> <PERMISSIONS_JSON>`** — consumer runs once out-of-band to populate the SM secret with the GitHub App's `app_id`, private-key PEM, and explicit component-matching scope. It verifies the canonical scope digest against the component-owned secret tag before writing. It uses `set -euo pipefail`, keeps the PEM out of process arguments, and scrubs its private temporary file on exit.
- **`mint-github-app-token.sh <SECRET_ID> <REPO_OWNER> <REPO_NAME>`** — CI step. Reads the SM secret, verifies the tag, stored digest, scope, and requested target before private-key use, signs a JWT with RS256, discovers the installation ID, and exchanges it for a one-hour token. Every request names exactly one repository and carries the bound, non-empty permission map. It prints the token to **stdout only** and never echoes the PEM, JWT, or token to stderr.

## Scope and migration

Repository entries use `owner/name`. A single `"*"` entry allows the helper to target any
repository in the installation, but the minted token is still narrowed to the one requested
repository. Permissions use GitHub App permission names with `read`, `write`, or `admin` values.
The component rejects duplicate or mixed-wildcard repositories, malformed names, empty scope,
more than 500 repositories, more than 100 permissions, or a canonical scope above 16 KiB. The
helpers reject a complete secret value above 64 KiB.

The former three-argument population command is intentionally unsupported because it stored
wildcard repositories and an empty permission map. Pass the exact values used by the component:

```bash
node_modules/@hulumi/k8s-baseline/scripts/populate-github-app-secret.sh \
  private-deps-github-app \
  123456 \
  ./github-app.private-key.pem \
  '["example/private-dependency"]' \
  '{"contents":"read"}'
```

The operator needs `secretsmanager:DescribeSecret` and `secretsmanager:PutSecretValue` to
populate the secret. The runtime IAM policy created by this component grants only
`GetSecretValue` and `DescribeSecret` on the single secret ARN; it does not grant tag mutation.
Keep broader tag-management authority away from the minting principal because the scope binding
depends on the IaC-owned tag.

Both helpers use the official `https://api.github.com` endpoint, require TLS 1.2 or newer, and
send `X-GitHub-Api-Version: 2026-03-10`. A missing or mismatched tag, malformed stored scope,
disallowed target, signing error, or API error produces a bounded reason-only security event and
no token.

Both scripts ship in the npm tarball via `package.json`'s `files: ["scripts/"]` discipline. Verified by an integration test that runs `npm pack && tar tf` and asserts the two scripts are present.

Source: [packages/k8s-baseline/src/github-app-credential.ts](../../packages/k8s-baseline/src/github-app-credential.ts) + [packages/k8s-baseline/scripts/](../../packages/k8s-baseline/scripts/).

Provider references: [GitHub installation access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app), [GitHub Apps REST API](https://docs.github.com/en/rest/apps/apps), and [AWS Secrets Manager tags](https://docs.aws.amazon.com/secretsmanager/latest/userguide/managing-secrets_tagging.html).
