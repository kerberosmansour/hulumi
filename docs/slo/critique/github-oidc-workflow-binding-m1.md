# Critique — GitHub OIDC workflow binding M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-github-oidc-workflow-binding.md`
Verdict: approved for bounded execution after the revisions captured below.

## CEO pass

- The current policy name promises workflow-bound deployment trust while AWS accepts a branch-only role. The repair must change the actual trust document and the mandatory validator together.
- The package can publish this breaking security correction in the coordinated release already planned elsewhere; this milestone does not edit versions or publish.
- Revision accepted: treat omitted reusable-workflow binding as a synchronous constructor error, including sandbox tier, because a weaker default would preserve the reported authority path.

## Engineering lead pass

- AWS documents only `aud`, `sub`, and `amr` mappings for this OIDC path. Emitting a separate `job_workflow_ref` condition key is not a valid implementation of the intended boundary.
- GitHub's documented `include_claim_keys` order is part of the exact subject value. Constructors and docs must use `repo`, `context`, then `job_workflow_ref`.
- Revision accepted: preserve the existing environment/ref input model, require `reusableWorkflowRef` for both modes, and render one custom scalar `sub` instead of introducing another public abstraction.

## Security pass

- `StringEqualsIfExists` evaluates true when the condition key is absent. AWS warns against set operators on single-valued keys. Multiple values under one positive operator are alternatives, so one weak value broadens the role.
- A structural parser must validate complete unique pairs and exactly one context axis. Searching for the three key names would accept decoys, duplicates, and malformed subjects.
- Revision accepted: accept only scalar `StringEquals`; require `repo`, `job_workflow_ref`, and exactly one of `environment` or `ref`; reject wildcard, empty, control-character, malformed, duplicate, overlong, pull-request, and non-`refs/` ref values.

## Design pass

- Existing consumers need an operational migration path because changing the AWS trust and GitHub template is coordinated state. GitHub says to create the matching cloud condition before changing the token format.
- A single role cannot safely carry old and new subjects because the policy deliberately rejects alternative subjects. Operators can accept a brief fail-closed interval or create a separately named parallel role.
- Revision accepted: document the exact template, expected subjects, rollout order, rollback, and the fact that GitHub organization templates require repository opt-in.

## Final constraints

- Exactly one scalar `StringEquals` `sub` restriction with repository, reusable workflow, and one exact context.
- Generated AWS conditions contain `aud` and `sub` only; workflow identity is inside `sub`.
- Constructor validation occurs before any child provider resource is registered.
- Azure and GCP behavior remains unchanged.
- No dependency, lockfile, version, publication, live provider, suppression, preview-unknown, or out-of-scope change.
- RED evidence must reproduce branch-only acceptance and standalone unsupported workflow-key generation before implementation.
