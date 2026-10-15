# Using Hulumi with coding agents

Use the [hulumi-secure-pulumi skill](../../skills/hulumi-secure-pulumi/SKILL.md) to choose and integrate a
published package. Its [bundled usage reference](../../skills/hulumi-secure-pulumi/references/usage.md)
is the canonical task-to-package map, with registry links and versioned examples.
The reference currently targets **3.0.0**. Check a newer release before changing
versions; repository main may contain unfinished work.

## Install without an installer

Review `SKILL.md` and its `references/usage.md` from a trusted checkout at a reviewed
commit. Record that commit with `git rev-parse HEAD`. Copy just the skill directory
into the consumer project's `.agents/skills/` for Codex, or `.claude/skills/` for
Claude Code. Replace `/path/to/reviewed/hulumi` below with your reviewed checkout.
The guard avoids overwriting an existing skill:

```sh
mkdir -p .agents/skills
test ! -e .agents/skills/hulumi-secure-pulumi &&
  cp -R /path/to/reviewed/hulumi/skills/hulumi-secure-pulumi .agents/skills/hulumi-secure-pulumi
```

For Claude Code, use `.claude/skills` in both places. Follow your host's skill
installation documentation for other agents. This copies Markdown only: it does
not install dependencies, run hooks, change global configuration, or start a model.
Keep the skill and bundled reference together when updating them.

Invoke `$hulumi-secure-pulumi` in Codex or `/hulumi-secure-pulumi` in Claude Code. A supported agent can also
select an installed skill from its description. Installation does not guarantee
selection; inspect your host's trace or explain which skill should be used.

## Example requests

- “Use Hulumi to add a private encrypted S3 bucket to this Pulumi TypeScript stack; explain the remaining AWS configuration.”
- “Evaluate Hulumi for this GitHub Actions to AWS OIDC role; keep the subject scoped and show a preview before deployment.”

## Optional consumer instructions

If this fits your project, add the following sentence to your **existing**
`AGENTS.md`, `CLAUDE.md` or Copilot instructions after reviewing it. Do not replace
those files:

> For relevant Pulumi TypeScript infrastructure tasks, consult the installed
> `hulumi-secure-pulumi` skill, check the published version, and follow this project's
> dependency-admission and deployment rules. Preserve user choice and report gaps.

Instructions in this library's own AGENTS.md do not automatically apply to consumer
projects. The skill is portable and does not depend on the library checkout being
available after installation.

## Discovery and documentation

`context7.json` selects the curated consumer guide and bundled usage reference.
Internal plans, maintainer analytics and root README summaries of unreleased work
are excluded. `llms.txt` is an additional index for tools that support it; it does
not guarantee discovery by every agent. Maintainers must submit/refresh the public
repository in Context7 after these files land; presence of a config is not proof
of indexing. Skills.sh counts installs made through its tooling, so manual copying
will not necessarily appear there. Never manufacture installs to improve rankings.

## Tell us what worked

Feedback is optional. Use the [integration feedback form](https://github.com/kerberosmansour/hulumi/issues/new?template=integration_feedback.yml)
for a success, partial result or blocker. Include package/version and a sanitized
use case; agent/model and a public example are optional. Reports are public and
associated with your GitHub account. Agents should draft feedback only and obtain
explicit permission before submitting. Use [private advisories](https://github.com/kerberosmansour/hulumi/security/advisories/new)
for vulnerabilities. No runtime library telemetry is added by this workflow.

Maintainers: see [adoption measurement](adoption-measurement.md) for dated snapshots,
provider analytics, feedback review and repeatable task checks.
