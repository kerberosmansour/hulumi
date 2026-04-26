---
title: GitHubAppCredential
description: Provisions an AWS Secrets Manager container + scoped IAM read policy for a GitHub App's credential. Ships populate-github-app-secret.sh + mint-github-app-token.sh in the npm tarball for build-time use under BuildKit's --mount=type=secret pattern.
---

# `GitHubAppCredential`

`@hulumi/k8s-baseline.GitHubAppCredential` — provisions:

1. An `aws.secretsmanager.Secret` encrypted with the consumer-supplied `kmsKeyAlias`.
2. An `aws.iam.Policy` with `secretsmanager:GetSecretValue` + `secretsmanager:DescribeSecret` scoped to **the single SM ARN** (never `*`).
3. (Optional) An `aws.iam.RolePolicyAttachment` linking the policy to a supplied principal ARN.

The component does **not** mint tokens. Tokens are minted at build time, inside `docker build`, via the BuildKit secret-mount pattern. The package ships two user-facing executable scripts at `node_modules/@hulumi/k8s-baseline/scripts/`:

- **`populate-github-app-secret.sh <SECRET_ID> <APP_ID> <PEM_PATH>`** — consumer runs once out-of-band to populate the SM secret with the GitHub App's `app_id` + private-key PEM. Uses `set -euo pipefail` + a `trap` to scrub temp files on exit.
- **`mint-github-app-token.sh <SECRET_ID> <REPO_OWNER> <REPO_NAME>`** — CI step. Reads the SM secret, signs a JWT with RS256, discovers the installation ID, exchanges for a 1-hour scoped installation token. Prints the token to **stdout only**. Never echoes the PEM or token to stderr.

Both scripts ship in the npm tarball via `package.json`'s `files: ["scripts/"]` discipline. Verified by an integration test that runs `npm pack && tar tf` and asserts the two scripts are present.

Source: [packages/k8s-baseline/src/github-app-credential.ts](../../packages/k8s-baseline/src/github-app-credential.ts) + [packages/k8s-baseline/scripts/](../../packages/k8s-baseline/scripts/).
