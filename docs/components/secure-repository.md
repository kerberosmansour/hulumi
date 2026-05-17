# SecureRepository

`SecureRepository` creates or adopts a GitHub repository and applies Hulumi's
repository hardening posture through repository settings plus a default-branch
ruleset.

## New Repository

```ts
import { SecureRepository } from "@hulumi/baseline/github";

new SecureRepository("service-api", {
  tier: "startup-hardened",
  visibility: "private",
  requiredStatusChecks: {
    strictRequiredStatusChecksPolicy: true,
    requiredChecks: [{ context: "test" }, { context: "lint" }],
  },
});
```

By default, the component emits a private repository, enables vulnerability
alerts, disables merge commits and rebase merges, enables squash merges, deletes
branches on merge, and creates an active default-branch ruleset. The
`startup-hardened` tier adds signed commits, required linear history, and a
pull-request rule.

## Existing Repository Adoption

Use `adoptExisting: true` for the first Pulumi import of an already-created
repository. The component passes Pulumi's `import` option to the child
`github.Repository` resource, then emits the same hardening resources and
settings it would use for a new repository.

```ts
import { SecureRepository } from "@hulumi/baseline/github";

new SecureRepository("zaprun", {
  tier: "startup-hardened",
  visibility: "public",
  adoptExisting: true,
  importRepositoryId: "zaprun",
  acknowledgePublic: true,
  publicJustification: "Open-source CLI published for public security review",
  requiredStatusChecks: {
    strictRequiredStatusChecksPolicy: true,
    requiredChecks: [{ context: "rust", integrationId: 15368 }],
  },
  pullRequestRule: {
    requiredApprovingReviewCount: 0,
    allowedMergeMethods: ["squash"],
  },
});
```

In most cases, the component name, GitHub repository name, and
`importRepositoryId` should all match. If `importRepositoryId` is omitted while
`adoptExisting` is true, Hulumi uses the component name as the import ID.

Run `pulumi preview` before `pulumi up` and check for unintended renames,
visibility changes, or ruleset conflicts. Pulumi requires imported resource
inputs to match the existing cloud resource closely enough for the provider to
adopt it. After the repository is imported into state, remove `adoptExisting`
and `importRepositoryId` from the program and run another preview; the resource
should remain under management without a replacement.

Hulumi does not manage repository feature toggles such as issues, projects,
wiki, downloads, or the create-time `autoInit` flag. The component preserves
those existing settings with Pulumi `ignoreChanges` so adopting a live
repository does not silently disable collaboration features.

Repository adoption imports the `github.Repository` child. The default-branch
ruleset is still created by Hulumi. If the repository already has a manual
ruleset with a different name, preview will show a new Hulumi-managed ruleset;
reconcile or remove the manual ruleset before applying if you want one ruleset.

Public repositories still require `acknowledgePublic: true` and a non-empty
`publicJustification`. Supplying `importRepositoryId` without
`adoptExisting: true` is rejected so imports cannot happen implicitly.
