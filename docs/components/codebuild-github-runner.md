# CodeBuild GitHub Actions runner (unreleased)

`CodeBuildGitHubRunner` constructs an ephemeral AWS CodeBuild runner project and
its authenticated GitHub webhook pair. It reuses Guardian's bridge shape and
Hulumi's existing SDKs. No new dependency is introduced. This source capability
is not in the immutable 3.0.0 npm release.

```ts
import { CodeBuildGitHubRunner } from "@hulumi/platform-patterns";

const runner = new CodeBuildGitHubRunner("ci", {
  tier: "startup-hardened",
  owner: "example-org",
  repository: "example-repo",
  projectName: "example-linux-runner",
  sourceAuthentication: "existing-account-oauth",
  repositoryVariableName: "CI_RUNNER_PROJECT",
});
```

Before applying, configure CodeBuild's GitHub OAuth source connection in the
selected AWS account/region. Supply deployment AWS credentials and GitHub
provider credentials with permission to manage that repository's hooks/variables.
The component creates an explicit GitHub provider fixed to the given owner and
`https://api.github.com/`; it does not reuse an unrelated default provider owner.
Optional `githubAuth` accepts the provider's token or App authentication, never
both; credentials are secret Pulumi inputs. Otherwise the provider uses its
standard environment credentials. Use a protected encrypted state backend.

The module never creates/replaces the shared account SourceCredential singleton.
CodeConnections/SecretsManager/PAT source modes are not silently enabled. Guardian's
optional connection-token IAM permissions are intentionally absent. This does
not promise every operator source-auth configuration works without extra setup.
Source-auth failure stops deployment; it does not trigger a broader fallback.

Defaults: ARM Linux managed 3.0 image, small compute, no cache/artifacts, no VPC,
nonprivileged container, 30-minute build timeout, 15-minute queue timeout, one
concurrent build and 14-day CloudWatch retention. The role writes only its own
log streams and trusts CodeBuild for the actual account/exact project ARN.
The selected AWS provider supplies the account/region. Only commercial AWS
partitions are supported by this initial ARN contract.

Choose `architecture: "x86_64"` for official standard 7.0; instanceSize is small,
medium or large. Build timeout 5..120, queue 5..60, concurrency 1..4 and retention
7/14/30 are deliberately bounded. Project names are 2..48 safe characters.
`privilegedMode: true` and `vpc` are explicit risk expansions, not safe defaults.
VPC adds documented network-interface permissions, including required broad EC2
resource operations; review those separately. The dedicated CrossGuard pack flags
privilege, extra role authority and all VPC attachment unless specifically
suppressed after review. A subnet ID alone cannot prove absence of production
connectivity. See [policy configuration](codebuild-runner-policy-pack.md).

The CodeBuild webhook uses manual creation and only WORKFLOW_JOB_QUEUED. The GitHub
hook sends workflow_job events with TLS verification and the returned secret,
protected by Pulumi secret metadata. No payload URL/secret is publicly exported.
No pull-request-comment approval setting or ignoreChanges workaround is installed.
Provider errors and refresh/update failures remain visible. Pulumi manages resource
dependencies; this is not a custom lifecycle/rollback controller.

Public outputs include projectName/projectArn, roleArn, logGroupName,
runnerLabelTemplate and recommendedLabels. Paste the label template into trusted
workflow YAML. The optional repository variable contains project name only;
GitHub does not recursively evaluate expressions inside a variable's value.

```yaml
runs-on:
  - codebuild-${{ vars.CI_RUNNER_PROJECT }}-${{ github.run_id }}-${{ github.run_attempt }}
```

AWS supports workflow-label overrides for image, size, fleet, buildspec and runner
registration. Recommended labels do not enforce isolation, allowed images or a
maximum bill. Concurrency/timeouts constrain configured project work; they are
not account spend limits. Keep workflow definitions and token permissions trusted,
use least-privilege job tokens and isolate untrusted jobs from production accounts,
data, deployment authority and reusable privileged runners. Do not assume a
CrossGuard preview governs every future GitHub workflow edit.

Local evidence exercises the real exported constructor, Pulumi runtime resource
inputs and production policy rules. AWS/GitHub transport is mocked there. Live
create/refresh/update, valid/forged webhook delivery, runner pickup/cancellation
and cloud cleanup remain unqualified until authenticated sandbox proof. The
available local sandbox SSO session was expired during implementation; no cloud
resources were created and no cost-saving/production-safety claim is inferred.
Issue #199 remains open for that qualification and complete upstream migration.

The role policy fails closed when resolved role ARN/provider identity is unavailable,
including incomplete preview data. Live qualification must verify actual preview
and apply behavior before this source capability is published as operational.
