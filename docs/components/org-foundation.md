# OrgFoundation

`OrgFoundation` applies hardened GitHub organization settings, Actions
permissions, rulesets, and an organization OIDC subject-claim template.

## OIDC subject identity contract

GitHub replaces the complete `sub` format when an organization installs a
custom subject template. Hulumi therefore accepts a custom template only when
it contains all three load-bearing identity axes:

- `repo` binds the calling repository.
- `job_workflow_ref` binds the called reusable workflow and its ref.
- `environment` binds the protected deployment environment.

The default remains:

```text
repo, context, job_workflow_ref, environment
```

`context` preserves GitHub's branch, tag, pull-request, or environment context
in the default subject. A custom template may add other claim keys such as
`repository_id`; every key must be unique and contain only letters, numbers,
and underscores. Hulumi preserves the caller's order.

```ts
import { OrgFoundation } from "@hulumi/baseline/github";

new OrgFoundation("platform", {
  tier: "startup-hardened",
  organization: "my-org",
  billingEmail: "platform@example.com",
  oidcSubTemplate: {
    useDefault: false,
    customTemplate: ["repo", "job_workflow_ref", "environment", "repository_id"],
  },
});
```

The constructor rejects missing identity axes, wildcard, empty, malformed,
duplicate, and non-string entries before registering the GitHub resource.
`HULUMI-H2-no-wildcard-oidc-template` enforces the same invariant for every
previewed organization-template resource, including raw resources and children
of component resources. The stable rule ID is retained for compatibility.

## Repository opt-in

GitHub organization templates do not automatically change repositories that
have not opted into the organization template. Repository opt-in and matching
cloud-provider trust conditions remain operator responsibilities. Configure the
matching cloud trust before changing the GitHub template so active deployments
do not lose access.

References:

- [GitHub OpenID Connect reference](https://docs.github.com/en/actions/reference/security/oidc)
- [GitHub Actions OIDC REST endpoints](https://docs.github.com/en/rest/actions/oidc)
