# Workflow Governance Linter

M4 adds `scripts/workflow-governance-lint.mjs`, a bounded local repository
scan for GitHub workflow governance. It reads tracked workflow files and
CODEOWNERS entries with `git ls-files`; test fixtures can pass `--repo-root`.
The script does not call the network.

## Command

```bash
node scripts/workflow-governance-lint.mjs
```

## Stable Rule IDs

| Rule ID                                      | Purpose                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `WF_SHA_1_FULL_LENGTH_SHA_PIN`               | Third-party actions and reusable workflows must use 40-character commit SHA refs.             |
| `WF_PERM_1_MINIMUM_GITHUB_TOKEN_PERMISSIONS` | Workflows must declare top-level token permissions and avoid broad default `contents: write`. |
| `WF_CODEOWNERS_1_WORKFLOWS_PROTECTED`        | CODEOWNERS must cover `/.github/workflows/`.                                                  |

The linter reports file and line only. It does not scan source code and does
not inspect or print secret values.
