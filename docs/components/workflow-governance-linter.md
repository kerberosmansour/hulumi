# Workflow Governance Linter

M4 adds `scripts/workflow-governance-lint.mjs`, a bounded local repository
scan for GitHub workflow governance. It reads tracked workflow files and
CODEOWNERS entries with `git ls-files`; test fixtures can pass `--repo-root`.
The default command is offline. The opt-in `--check-settings` mode shells out
to `gh api` to resolve live GitHub environments for privileged deployment jobs.

## Command

```bash
node scripts/workflow-governance-lint.mjs
```

For live environment proof:

```bash
node scripts/workflow-governance-lint.mjs --check-settings
```

For an explicitly approved self-hosted runner:

```bash
node scripts/workflow-governance-lint.mjs \
  --allow-self-hosted-runner-label linux \
  --allow-self-hosted-runner-label x64 \
  --allow-self-hosted-runner-label deploy-prod
```

## Stable Rule IDs

| Rule ID                                                 | Purpose                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `WF_SHA_1_FULL_LENGTH_SHA_PIN`                          | Third-party actions and reusable workflows must use 40-character commit SHA refs.                  |
| `WF_PERM_1_MINIMUM_GITHUB_TOKEN_PERMISSIONS`            | Workflows must declare top-level token permissions and avoid broad default `contents: write`.      |
| `WF_CODEOWNERS_1_WORKFLOWS_PROTECTED`                   | CODEOWNERS must cover `/.github/workflows/`.                                                       |
| `WF_PR_1_NO_UNTRUSTED_HEAD_CHECKOUT`                    | `pull_request_target` / `workflow_run` workflows must not check out attacker-controlled head code. |
| `WF_ENV_1_DISPATCH_PRIVILEGED_JOB_REQUIRES_ENVIRONMENT` | Privileged `workflow_dispatch` jobs must declare a protected environment.                          |
| `WF_ENV_2_LIVE_ENVIRONMENT_EXISTS`                      | Opt-in live check: declared privileged-job environment must exist in GitHub repo settings.         |
| `WF_ENV_3_LIVE_ENVIRONMENT_REQUIRES_REVIEWERS`          | Opt-in live check: declared privileged-job environment must have required reviewer protection.     |
| `WF_RUNNER_1_SELF_HOSTED_REQUIRES_APPROVAL`             | Self-hosted runner usage requires explicit approval for every non-`self-hosted` runner label.      |

The linter reports file and line only. It does not scan source code and does
not inspect or print secret values. `--check-settings` reports resolver errors
as findings instead of treating unknown live posture as clean.
