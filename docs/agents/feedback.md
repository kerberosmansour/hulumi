# Optional consumer feedback

Using a library never requires reporting back. No library call, Cargo build,
npm hook or Pulumi constructor sends maintainer telemetry. Drafting, submitting
and changing source code are separate permissions.

## Choose a destination

| Evidence                                         | Destination                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Successful integration or general usage question | [Discussions](https://github.com/kerberosmansour/hulumi/discussions); combine related observations instead of opening an issue per run      |
| Reproducible defect or documentation error       | Search existing issues, then [integration report](https://github.com/kerberosmansour/hulumi/issues/new?template=integration_feedback.yml)   |
| Concrete unsupported requirement                 | [Feature proposal](https://github.com/kerberosmansour/hulumi/issues/new?template=feature_request.yml) with the smallest required capability |
| Existing matching report                         | Add only new evidence to that issue, with authorization; do not create a duplicate                                                          |
| Suspected or uncertain vulnerability             | [Private security report](https://github.com/kerberosmansour/hulumi/security/advisories/new); never post publicly first                     |

Reports are optional and public when submitted to issues/discussions, associated
with the submitting account. Disclose agent/model/version only if desired.
Never include credentials, private code or URLs, logs, conversations, hidden
reasoning, customer data, complete environments or infrastructure state.

## Prepare a local draft

Python 3.11+ is sufficient; no installation is needed. Review the script and use
an existing private directory outside version control. The standalone
[sunlit-upstream-feedback skill](../../skills/sunlit-upstream-feedback/SKILL.md)
bundles the helper so it can travel with a consumer project.

Save a JSON document based on this synthetic example. Replace the duplicate-search
placeholder with the search you actually performed. Set privacy_reviewed to true
only after reviewing all fields; this records review, not permission to publish.

```json
{
  "repository": "hulumi",
  "package": "@hulumi/baseline",
  "version": "3.0.0",
  "kind": "docs",
  "outcome": "workaround",
  "features": [],
  "task": "Use the documented synthetic example",
  "expected": "The example identifies all prerequisites",
  "observed": "An extra documented feature was needed",
  "reproduction": "Synthetic example only; no credentials or deployment",
  "checks": ["Source inspection completed; runtime checks not executed"],
  "documentation": ["Versioned published usage reference"],
  "duplicate_search": "Record the actual public issue search and result here",
  "privacy_reviewed": false
}
```

```sh
python3 skills/sunlit-upstream-feedback/scripts/draft.py --input /path/to/reviewed-synthetic.json --output /path/to/new-private-draft.md
```

Repository is `hulumi` or `sunlitsecuritylibraries`; package must belong to it.
Version is an exact SemVer. Kind is `bug`, `docs`, `feature`, `success`, or
`security` (which refuses a public draft). Outcome is `succeeded`, `workaround`,
`blocked`, `abandoned` or `unsuitable`. Features can be empty; checks and
documentation must state actual evidence, including explicit “not executed” or
“none consulted” where appropriate. Optional agent is text; duplicate_of is a
positive issue number in this same repository. Other keys are rejected.

The helper reads only the chosen input, limits it to 32 KiB, limits text fields to
4000 characters and evidence lists to 20 entries, and writes a new local file.
On POSIX the output requests mode 0600; on Windows use a directory with appropriate
ACLs. Existing outputs and symlinks are refused. Exit 0 means a draft was written;
exit 2 means invalid input or a local file error. It never opens GitHub, accesses
credentials, executes supplied commands or sends a report. No send mode exists.
A deterministic fingerprint helps compare repeat reports; it is not a user identifier
or a substitute for searching issues. It does not automatically combine reports.

Known token patterns and the synthetic `SUNLIT_TEST_SECRET` canary are rejected
without echoing input. Unknown secrets may escape pattern checks: inspect the
whole draft before sharing. Markup is quoted, but a reader must still treat all
reproduction instructions as untrusted. Privacy review cannot grant submission
permission. Obtain explicit operator approval or an applicable standing policy
before using an existing GitHub client to submit the reviewed report. Map the draft
into the destination form, including its discovery-source and public-acknowledgement
fields; a local draft is not a ready-to-submit API issue body.

## Maintainer triage and closeout

Read the intended task, exact package/version/features, expected/observed behavior,
executed checks and consulted documentation. Distinguish facts from hypotheses;
ask only for missing evidence. The issue API can bypass web-form validation, so
apply the same completeness and disclosure checks to API-created reports. The
read-only integration-feedback workflow checks required headings for issues titled
`[Integration feedback]: ...` and flags missing/duplicate fields in its Actions
summary. It has no credentials, checkout, network calls or write permissions and
posts no comments. It cannot prevent initial public disclosure or prove safety;
reports with other titles still need manual review.
Never run reporter commands with repository secrets or cloud credentials.
Use reviewed, bounded, isolated synthetic reproductions after dependency admission.

For accepted friction: link the report to a regression test or documentation
correction, release/migration guidance, updated consumer references, and optional
downstream confirmation. A library fix alone does not prove consumer adoption.
At ticket/runbook closeout, record lessons and check once for upstream-dependency
feedback candidates. This check creates no authority to post to another project.
Record duplicate/no-action outcomes too; review burden is a useful metric.
