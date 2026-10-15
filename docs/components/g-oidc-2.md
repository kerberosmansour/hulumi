# G_OIDC_2 GitHub OIDC Administrator Boundary

`G_OIDC_2` is the mandatory stack rule exposed as `HulumiGithubHardeningPack`
H4. It finds IAM roles whose singleton or array trust policy names the exact
GitHub Actions OIDC issuer, then rejects these authority paths:

- cluster-scoped `AmazonEKSClusterAdminPolicy` access associations;
- AWS managed `AdministratorAccess` on the role's `managedPolicyArns` in the
  commercial (`aws`), GovCloud (`aws-us-gov`), or China (`aws-cn`) partition;
- `RolePolicyAttachment`, `RolePolicyAttachmentsExclusive`, and generic
  `PolicyAttachment` resources targeting the role;
- exact full-administrator documents in the role's `inlinePolicies` or a
  linked `RolePolicy`; and
- an in-stack customer-managed `Policy` with either an exact full-administrator
  statement or an `Allow` statement using `NotAction` or `NotResource`, when
  attached by an exact ARN or Pulumi property dependency.

`NotAction` and `NotResource` describe complements of evolving AWS action and
resource universes. `G_OIDC_2` therefore rejects their presence on an `Allow`
statement instead of attempting to prove the residual authority safe. This is
intentional even when a complement value is empty, malformed, or paired with a
seemingly scoped resource. Complement operators on `Deny` statements are
guardrails rather than permission grants and do not trigger this check.

Role correlation prefers Pulumi property and resource dependency URNs. Exact
role ARN, name, or ID values are the fallback for serialized previews and test
harnesses. Issuer, role, and policy values are never substring-matched.

AWS managed `AdministratorAccess` recognition uses exact equality for these
three ARNs:

- `arn:aws:iam::aws:policy/AdministratorAccess`
- `arn:aws-us-gov:iam::aws:policy/AdministratorAccess`
- `arn:aws-cn:iam::aws:policy/AdministratorAccess`

Customer-account policies, unknown partitions, alternate case, whitespace,
suffixes, prefixes, and embedded strings do not match this managed-policy
predicate. Inspectable customer-managed policies remain covered separately by
the exact full-admin document check.

## Boundary

This preview rule evaluates resources present in one Pulumi stack. It does not
download external managed-policy versions or compute AWS effective permissions
across permissions boundaries, session policies, Organizations controls,
resource policies, or out-of-band attachments. Use AWS IAM Access Analyzer and
the deployment's effective-authorization tests for that wider proof.

The rule emits resource and role URNs without copying policy documents into
diagnostics. A suppression requires the existing documented `G_OIDC_2` or
`HULUMI-H4` suppression contract.

Use positive, explicit `Action` and `Resource` allowlists for GitHub deployment
roles. Where practical, add a separately reviewed restrictive permissions
boundary as defense in depth; the presence of a boundary ARN alone is not proof
that it blocks every escalation path.
