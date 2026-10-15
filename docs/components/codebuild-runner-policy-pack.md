# CodeBuild runner policy pack (unreleased)

After the next release, create a dedicated policy directory with this
`PulumiPolicy.yaml`:

```yaml
name: isolated-codebuild-runners
runtime: nodejs
```

Include a `package.json` with a nonempty version (required by the PolicyPack
runtime), for example `{"name":"isolated-codebuild-runners","version":"1.0.0","private":true}`.
Its `index.js` loads the explicit package entrypoint:

```js
require("@hulumi/policies/platform/packs/codebuild-runner");
```

Install the reviewed package version and its declared peers in that directory
using your dependency admission process, then pass the directory to
`pulumi up --policy-pack ./runner-policy`. Importing the library namespace
exports handlers/metadata without starting a PolicyPack server. The explicit
pack subpath creates the real CrossGuard pack.

| Rule                       | Mandatory default                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| CB_RUNNER_1_PRIVILEGED     | Report privileged mode or inability to prove false                                                     |
| CB_RUNNER_2_ROLE_AUTHORITY | Report external/unknown role or permissions beyond the associated project's own CloudWatch log streams |
| CB_RUNNER_3_VPC            | Report VPC attachment, including unknown or production-connected subnets                               |

The role check parses complete supplied inline policy statements, checks linked
role policies/managed attachments and rejects malformed/unbounded/unknown grants.
It does not audit the contents of external managed policies. Unknown authority
is a finding rather than an assumed safe policy. It does not replace a complete
IAM trust, account-boundary, workflow or network-route review.

Exceptions reuse Hulumi's suppression matching after stricter admission. Each
must name one rule, the exact project resource URN, a nonempty reviewer/owner and
reason, and a canonical UTC expiry in the future. No wildcard/global/malformed/
expired exception suppresses a finding. Each exception is configured for its own
rule. A privilege exception does not allow VPC or extra IAM grants.

```json
{
  "CB_RUNNER_1_PRIVILEGED": {
    "suppressions": [
      {
        "ruleId": "CB_RUNNER_1_PRIVILEGED",
        "urnScope": "urn:pulumi:isolated::ci::hulumi:platform:CodeBuildGitHubRunner$aws:codebuild/project:Project::ci-project",
        "owner": "security-team",
        "reason": "Reviewed isolated Docker-only job; no production access",
        "expiresAt": "2026-11-01T00:00:00Z"
      }
    ]
  }
}
```

Use the actual preview resource URN; the example does not approve any real stack.
The pack applies to CodeBuild projects in its analyzed stack. VPC support can
require separate role-authority and VPC exceptions. Review every additional grant;
an exception is a deliberate authority expansion, not a token of general safety.
The pack cannot constrain later AWS label overrides or GitHub job-token settings.
