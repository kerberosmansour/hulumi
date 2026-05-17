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
  rulesetName: "hulumi-startup-hardened-default-branch",
  adoptExistingRuleset: true,
  rulesetImportId: "zaprun:16489045",
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
Rulesets require a separate import ID because GitHub identifies them by numeric
ID; the Pulumi provider expects `<repository-name>:<ruleset-id>`.

Run `pulumi preview` before `pulumi up` and check for unintended renames,
visibility changes, or ruleset conflicts. Pulumi requires imported resource
inputs to match the existing cloud resource closely enough for the provider to
adopt it. After the repository is imported into state, remove `adoptExisting`
and `importRepositoryId`, and remove `adoptExistingRuleset` and
`rulesetImportId` if you imported a ruleset. Keep `rulesetName` when the
existing ruleset uses a non-default name. Run another preview; the resources
should remain under management without replacements.

Hulumi does not manage repository feature toggles such as issues, projects,
wiki, downloads, or the create-time `autoInit` flag. The component preserves
those existing settings with Pulumi `ignoreChanges` so adopting a live
repository does not silently disable collaboration features.

Repository adoption imports the `github.Repository` child. Ruleset adoption
imports the default-branch `github.RepositoryRuleset` child separately. If the
repository already has a manual ruleset and you do not set
`adoptExistingRuleset`, preview will show a new Hulumi-managed ruleset.

Public repositories still require `acknowledgePublic: true` and a non-empty
`publicJustification`. Supplying `importRepositoryId` without
`adoptExisting: true`, or `rulesetImportId` without
`adoptExistingRuleset: true`, is rejected so imports cannot happen implicitly.
