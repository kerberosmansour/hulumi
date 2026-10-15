# Verification — Protected admin IdP authorization integrity M1

Date: 2026-10-15
Runbook: `docs/RUNBOOK-protected-admin-idp-authorization.md`
Base: `f9b888596ba933f69f183a542e7ab4926287a546`
Verdict: local implementation gates passed; exact-head CI, merge, and merged-main Codex Security remain.

## Outcome and BDD evidence

| Evidence | Result |
| --- | --- |
| Provider contract | Current Cloudflare documentation confirms Include entries use OR logic, Login Methods checks which provider authenticated the user, and application `allowed_idps` limits provider choices. |
| Baseline | Focused component tests passed 3/3, and package build, typecheck, and lint passed before RED changes. |
| RED | The expanded 7-test suite produced three intended failures and four controls passing: IdP-only input registered resources, mixed email/IdP policy output contained a `loginMethod` alternative, and mixed group/IdP output contained the same alternative. |
| IdP-only refusal | Construction now rejects synchronously unless at least one email, email domain, or Access group authorization selector exists. No Cloudflare provider resource is registered. |
| Email plus IdPs | The application contains both provider IDs in `allowedIdps`; inline and reusable Include arrays contain only the email. Recursive assertions find no `loginMethod` key. |
| Group plus IdP | The application contains the provider ID in `allowedIdps`; the inline policy contains only the Access group and the output reports only that group. |
| Existing authorization union | Email, email-domain, and Access-group selectors retain their established order and OR union without an IdP restriction. |
| Focused/package regression | Focused suite 7/7. Complete `@hulumi/cloudflare-baseline` suite 24 passed with three live-provider integration tests intentionally skipped; package build, typecheck, and lint passed. |
| Workspace regression | Recursive test, build, typecheck, and lint passed across all 19 runnable projects. |

## Security and repository evidence

| Gate | Result |
| --- | --- |
| OSV admission | Official checksum-verified OSV-Scanner 2.7.0 scanned two unchanged resolved lockfiles and 575 package occurrences with zero vulnerability results and zero `MAL-*`; report SHA-256 `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`; receipt SHA-256 `c3c0f5f4117b350ce6d38650f98aa318ca95eb8e17e14b32d0f77151d196371e`. |
| Dependency diff | No manifest or lockfile changed. The admitted workspace graph was restored from the local pnpm store with frozen lockfiles, lifecycle scripts disabled, offline mode, 422 packages reused, and zero downloaded. |
| Semgrep | Semgrep 1.156.0 ran 74 TypeScript rules over the three changed TypeScript files with zero findings and zero errors; report SHA-256 `49e176320cbd83fbdfc575ca5fc955adab82d08f8d62a266d46c09b0be924c47`. |
| Secret review | Added lines matched zero high-confidence private-key, AWS access-key, GitHub-token, or OpenAI-key patterns. Inputs and tests contain identifiers only. |
| Repository governance | Prettier, license-boundary, exact-pin, workflow-governance, and `git diff --check` passed. All changed and SLO evidence files are within the exact milestone allow-list. |

## Residual limits

- `allowedIdps` limits authentication routing, while the selected providers' own account, MFA, and lifecycle policies remain operator-managed.
- Email-domain authorization intentionally admits every identity in that domain. Administrators who need a narrower population should use exact emails or a managed Access group.
- The component treats supplied Access group IDs as trusted references; group membership and deletion are governed outside this component.
- Tests use Pulumi mocks and do not mutate a live Cloudflare account. Provider field placement and policy semantics were checked against current official API and Access documentation.
- The component's separate reusable policy behavior is preserved; linking or consolidating policy resources would be a distinct compatibility and lifecycle change.

## Pending closeout

- Sign and DCO-stamp the exact source commit.
- Pass exact-head GitHub checks and review the final diff.
- Merge only the verified head under standing authorization.
- Run Codex Security against the exact merged-main commit and confirm `csf_18a737a03f908a5ae725cd34` is absent.
