# Critique — deployment governance evidence binding M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-deployment-governance-evidence-binding.md`
Verdict: approved for bounded execution after the revisions captured below.

## CEO pass

- The repair protects the release path itself: compliance must mean that the exact repository deploys through an exact protected environment and role, rather than that similar resources happen to exist.
- The component currently permits an empty environment list and does not mark its repository as deployment-capable. Both behaviors obscure the control and must become explicit.
- Revision accepted: document the source-compatible policy rule ID and the component migration that now requires at least one environment.

## Engineering lead pass

- A single predicate should evaluate the complete tuple so independent `some(...)` searches cannot be recombined accidentally.
- Property dependency edges provide stronger repository identity than names. IAM trust contents provide stronger deployment identity than component presence.
- Revision accepted: keep parsing local and bounded; do not refactor the general URN or GitHub OIDC packages.

## Security pass

- Component props and tags are declarations, not authority. They are useful only when the actual child IAM trust policy agrees.
- The accepted role must be environment-scoped, use exact `StringEquals`, exact GitHub provider/audience/subject/workflow values, one Allow statement, and no wildcard or alternate assume-role path.
- Revision accepted: add decoys for missing/wrong property dependencies, other environments, ref subjects, malformed JSON, extra statements, wrong principal/action/audience/workflow, missing child role, and wrong tags.

## Design pass

- `DeploymentRepositoryFoundation` should advertise deployment intent on the GitHub repository using the existing `deployment` topic that DEPLOY_GOV_1 already understands.
- Requiring a non-empty unique environment list makes the component name honest while preserving the separate `GitHubAwsOidcDeploymentRole` composition shown in the cookbook.
- Revision accepted: no new output or external dependency is needed; update the component, policy, cookbook, and migration text together.

## Final constraints

- One exact tuple across repository dependency, environment, component props, workflow ref, IAM tags, and IAM trust.
- No presence-only or basename-only exemption remains.
- No dependency, manifest, lockfile, version, publication, live provider call, suppression, or unrelated policy change.
- RED evidence must reproduce empty-foundation and independently matched evidence acceptance before implementation.
