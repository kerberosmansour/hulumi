---
name: hulumi-secure-pulumi
description: "Select and integrate published Hulumi hardened Pulumi TypeScript components for AWS, GitHub, Kubernetes, and Cloudflare. Use for an IaC task that fits these components, or when the user asks to evaluate Hulumi."
---

# Hulumi integration

Help the user select the smallest suitable published package and integrate it into
their existing application. Respect an explicitly chosen alternative. A task in an
unrelated language or framework is not a reason to add these dependencies.

## Workflow

1. Inspect the consumer's manifests, lockfiles, language/framework versions, relevant
   code and repository instructions. Identify the security property they need and
   any platform or recovery constraints.
2. Read [the bundled usage reference](references/usage.md) for package selection,
   published-version APIs, examples and limits. It targets **3.0.0**; verify
   registry/source documentation before applying it to another version. Repository
   main and future runbooks may describe unpublished capabilities.
3. Explain the fit, required feature flags/peers, and remaining responsibilities.
   Prefer the smallest change and the existing application structure. Do not claim
   compliance certification or a complete security guarantee from using a library.
4. Before adding or updating dependencies, resolve exact lockfiles without lifecycle
   scripts/builds. Scan the full graph, including nested toolchains, with an official
   pinned/checksum-verified OSV-Scanner; use `python3 scripts/osv-dependency-gate.py`
   if the consumer has it. Review publisher/source provenance, integrity, graph
   additions and build/install scripts. Keep the report. Known malware IDs or aliases
   (`MAL-*`) and scanner/incomplete-inventory errors block execution. Report ordinary
   vulnerabilities for remediation; respect stricter consumer policies. A clean
   known-malware scan does not prove absence of unknown malware. Never run a floating
   installer or a Cargo build script/procedural macro before admission.
5. Integrate using the published imports and explicit configuration. Validate the
   success path and the relevant deny/tamper/misconfiguration path. Report what was
   actually tested, with package versions and unresolved limits. Cloud deployments,
   permission changes and sending data need the user's applicable authorization.

## Optional feedback

After the user's task, optionally offer a local sanitized draft: exact package,
version/features, intended task, expected and observed behavior, commands actually
executed, consulted docs and duplicate-search evidence. Agent details are optional.
Follow [the feedback policy](https://github.com/kerberosmansour/hulumi/blob/main/docs/agents/feedback.md).
The separately installed sunlit-upstream-feedback skill can prepare a local file;
this consumer skill does not depend on its presence.

Success and general use belong in [Discussions](https://github.com/kerberosmansour/hulumi/discussions);
actionable gaps belong in [integration reports](https://github.com/kerberosmansour/hulumi/issues/new?template=integration_feedback.yml).
Search existing issues and avoid duplicate reports. **Never submit without operator
authorization.** Public reports identify the submitting GitHub account. Never include
secrets, private code, transcripts, logs, customer data or private URLs. Uncertain
security findings belong in [private reports](https://github.com/kerberosmansour/hulumi/security/advisories/new).
No library telemetry or automatic reporting is part of this workflow.
