# Distribution and adoption experiments

## Current entry points

Keep the public GitHub documentation and package READMEs as stable, readable entry
points. Link new consumer pages from [the integration guide](integration.md),
[task contracts](tasks.md) and the root llms.txt. The latter is navigation, not a
promise of search ranking or correct agent behavior. Keep future design/runbooks
separate from the supported, versioned consumer surface.

After merging documentation changes, refresh Context7 and verify actual answers
against the published-version references. Check the owner dashboard's inclusion
and exclusion lists against context7.json; a committed configuration does not prove
that an index has applied it. Keep evaluation, distribution and measurement guides
out of the consumer index. Record the exact query, source version and whether the
answer cites an installable capability. See [Context7 owner guidance](https://context7.com/docs/library-owners).

## Portable skills and directories

Use the direct, reviewed-copy installation in [the integration guide](integration.md).
It avoids adding an installer dependency. Keep bundled references and scripts with
the skill. Validate the package structure and test in each intended client before
claiming that client is supported; source review alone is not a fresh-agent trial.

Skills.sh says entries and rankings arise from legitimate CLI installations. Its
installer collects aggregate installation telemetry and documents an opt-out;
that is separate from library runtime behavior. Read its current configuration
before choosing that route, and admit any CLI dependency under the repository's
OSV/provenance policy. Do not generate artificial installs or run a floating
installer merely to obtain a listing. [Skills.sh FAQ](https://www.skills.sh/docs/faq).

A skills-only developer plugin can bundle the two consumer skills and
sunlit-upstream-feedback without an MCP service. OpenAI's portable format uses a
root plugin.json and skills/ directory. Public submission requires a verified
publisher identity, package scans and provider review; a valid local archive is
not an accepted directory listing. Test the bundle in a fresh authorized client
session before submission. [Packaging](https://developers.openai.com/plugins/build/plugins),
[submission requirements](https://developers.openai.com/plugins/deploy/submission).

## Pilot and feedback review

Use [the evaluation protocol](evaluation.md) for five integration tasks and the
negative cases. Keep blind discovery separate from a run supplied with a skill.
Start with synthetic projects and authorized downstream integrations; invite
external volunteers only with permission. Never treat maintainer testing as
independent adoption. No custom reporting service or MCP server is needed for
this experiment.

Track aggregate reach with [dated snapshots](adoption-measurement.md), and actual
outcomes through optional [feedback](feedback.md). Review after 14 and 28 days:
which tasks failed, which workarounds repeated, whether a released fix was confirmed
downstream, and how much duplicate triage it caused. This describes a manual
experiment, not a scheduled job or a claim that the trial has already run.

## Pulumi Registry packaging assessment

The current npm components do not supply the Registry's package schema and
component-plugin release surface. An npm listing alone does not establish Registry
eligibility. Pulumi documents schema-driven API documentation and a dedicated
registration step. [Publishing guidance](https://www.pulumi.com/docs/iac/guides/building-extending/packages/publishing-packages/).

Evaluate one small SecureBucket component package first: stable input/output schema,
provider compatibility, SDK/plugin packaging, versioned release artifacts, examples,
and tests preserving the current security defaults. Define the migration and
maintenance cost before expanding to other components. This maintenance change
neither repackages the libraries nor claims a Registry submission. Treat that as a
separate implementation decision after the pilot demonstrates demand.
