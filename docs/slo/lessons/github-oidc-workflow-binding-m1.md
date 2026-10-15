# Lessons — GitHub OIDC workflow binding M1

Date: 2026-10-15

1. A claim in GitHub's JWT is not automatically an AWS IAM condition key. AWS exposes a bounded OIDC mapping, so `job_workflow_ref` must be embedded in `sub` for AWS to enforce it.
2. Exact string equality is insufficient when the string omits an authority axis. A branch-only subject is literal and wildcard-free but still authorizes every workflow executing on that branch.
3. Operator semantics are part of the security boundary. `IfExists` can accept a missing key, set operators are inappropriate for the single-valued subject, and arrays create alternative subjects.
4. GitHub's custom-sub claim order is externally observable. The constructor, policy, and repository OIDC template must agree on `repo`, `context`, then `job_workflow_ref`.
5. Strong cloud trust requires a coordinated identity-provider change. Updating AWS first creates a secure outage; updating GitHub first also breaks the old trust. A parallel role is the clean zero-downtime migration.
6. Constructor validation and policy backstops should converge on one grammar. Otherwise a hardened component can emit a resource that the mandatory policy rejects.
7. Reusable workflow paths need full-shape validation. Substring checks accept multiple `@refs/` segments and other strings that do not name one pinned workflow identity.
8. Azure and GCP expose different claims and policy languages. Sharing a bounded subject parser is useful, while provider-specific required axes and operators must remain separate.
9. Workspace package builds are dependency-ordered because each build cleans `dist`. Running dependent package builds concurrently creates an artificial missing-types failure; the repository-wide topological build is the authoritative gate.
