# Lessons learned — Hulumi-for-GitHub M1

> Captured 2026-04-26 at the close of `/slo-execute M1`.

## Surprises

### 1. Bare framework citations don't render in the existing generator

The first BDD-test failure was the OIDC scenario test asserting `CIS-GitHub-v1.2.0` in the citation list. My initial scenario JSONs cited `CIS-GitHub-v1.2.0` as a _bare_ framework name (no colon-separated ID suffix). The generator's `resolveCitations` parses `controls[]` entries by splitting on `:`; entries without a colon land in the `unresolved` list rather than in `citations`. **Fix**: use a placeholder ID `CIS-GitHub-v1.2.0:PENDING-WORKBENCH` so the parser splits to framework prefix + opaque suffix and the citation renders. M3 will replace `:PENDING-WORKBENCH` with real WorkBench-resolved CIS section numbers.

This is a structural observation about the generator: framework prefixes only appear in citations when they're attached to a colon-separated ID. **Rule for the next milestone (M2)**: when extending `BUNDLED_STUBS` with a new framework prefix, every scenario citing it must use a `<prefix>:<id-or-placeholder>` pattern, never a bare prefix.

### 2. Allow-list amendment captured during execution

M1's allow-list omitted `skills/hulumi-threat-model/scripts/generate-threat-model.mjs` because the original assumption was that GitHub-specific framework citations would resolve via mapping FILES (which land in M3). But the BDD scenarios assert that GitHub-specific frameworks (CIS-GitHub-v1.2.0, NIST-SSDF-v1.1, OpenSSF-Scorecard, MITRE-ATTCK, GitHub-Well-Architected) appear in the _citations_ output of M1's scenarios — not just in M3's mapping files. To satisfy that contract, `BUNDLED_STUBS` (the framework-prefix-to-default-URL table inside `generate-threat-model.mjs`) must be extended in M1.

This is a real conflict between the M1 allow-list and the M1 BDD contract. Per `/slo-execute`'s allow-list discipline, the resolution was to extend the allow-list with explicit captured rationale (recorded inline in the M1 runbook file's Refactor budget paragraph). The minimum mechanical change was 5 new entries to `BUNDLED_STUBS`. **Rule for the next milestone**: when an allow-list amendment is needed, pause and capture the rationale in the runbook file's `Refactor budget` line so the trail is auditable; don't expand silently.

### 3. `@pulumi/github` resource shape is flatter than expected

I initially modeled the ruleset rules as block objects (`{ deletion: {} }`) following an outdated docs reference. The actual `RepositoryRulesetRules` shape uses `Input<boolean>` for the simple gates (`deletion`, `nonFastForward`, `requiredSignatures`) and only block objects for parameterized rules (`branchNamePattern`, `pullRequest`, etc.). Similarly, `RepositoryRulesetConditionsRefName` uses `includes` / `excludes` (plural with -s), not `include` / `exclude`.

**Rule for the next milestone (M2)**: when adding a new GitHub component, read the current `node_modules/.pnpm/@pulumi+github@6.13.0_typescript@5.9.3/node_modules/@pulumi/github/types/input.d.ts` shape _first_ before drafting the implementation. The provider's TypeScript types are accurate; outdated guides aren't.

### 4. `provider?: github.Provider` and `exactOptionalPropertyTypes`

The repo's `tsconfig.base.json` enables `exactOptionalPropertyTypes`, which forbids assigning `undefined` to optional properties when the optional property has a non-undefined-typed value. I had to reshape the `RepositoryArgs` literal: instead of inline `defaultBranch: args.defaultBranch` (which is `pulumi.Input<string> | undefined`), build the args object with a `if (args.defaultBranch !== undefined)` conditional spread. Same for `topics` and `securityAndAnalysis`.

**Rule for the next milestone (M2)**: every optional Pulumi `Input` field assigned from a possibly-undefined source needs a conditional-spread pattern, not inline assignment. This is a common gotcha with `exactOptionalPropertyTypes`.

## Decisions

### Intentional `hulumi:controls` tag omission

M1 deliberately omits the `hulumi:controls` tag on `SecureRepository` outputs. The repo description carries `hulumi:component=SecureRepository` and `hulumi:tier=<tier>` tags but NOT `hulumi:controls=...`. Reason: the `cis-github.ts` and `nist-ssdf-v1.1.ts` mappings don't ship until M3. M3 will add `hulumi:controls=...` as an additive change to both `SecureRepository` (M1 surface) and `OrgFoundation` (M2 surface) and update the corresponding BDD tests to assert the new tag's presence.

This is a deliberate staged-migration, not an oversight. Recorded here so M3 doesn't treat it as a regression.

### `acknowledgePublic` opt-in implementation pattern

The discriminated union approach (separate `SecureRepositoryArgsPrivate` / `SecureRepositoryArgsPublic` types unified by `SecureRepositoryArgs`) gives compile-time safety AND a clean runtime check. The runtime check is performed in the constructor before any child resources register, so a caller who casts through `as unknown as SecureRepositoryArgs` still hits the runtime invariant. The audit-event row to stderr uses `process.stderr.write("security_event " + JSON.stringify(...))` so structured-log readers can parse without a separate format.

### Public visibility ships with `securityAndAnalysis: undefined`

GitHub rejects the `securityAndAnalysis` field on public repos that aren't GHAS-licensed. M1 omits the field entirely on public-branch SecureRepositoryArgsPublic; private + internal repos still get it (with secret-scanning + push-protection on at startup-hardened). M3's `feature-not-licensed` honest-verdict treatment will explicitly mark the public-repo case as `feature-not-licensed: ["secret_scanning"]` rather than leaving it implicit.

## Deltas from plan

- **Added a fifth allow-list entry**: `skills/hulumi-threat-model/scripts/generate-threat-model.mjs` (extending `BUNDLED_STUBS`). Captured in the runbook file's Refactor budget paragraph.
- **No CodeQL / Semgrep / custom secret-scanning patterns shipped** — Rule 0 (infra-only contract) holds.
- **Sandbox-org integration test deferred** — env vars (`HULUMI_INTEGRATION=1`, `HULUMI_GITHUB_SANDBOX_ORG`, `HULUMI_GITHUB_APP_*`) are user-provisioned out-of-band. Test ships with `describe.skipIf(!ENABLED)` and a skip-with-reason marker. Sandbox run captured in completion summary as a deferred smoke-test follow-up.

## Rules for the next milestone (M2)

1. When extending `BUNDLED_STUBS` (or equivalent framework registry), use `<prefix>:<id-or-placeholder>` patterns in scenarios — never bare prefixes.
2. When introducing a new GitHub component, read `@pulumi/github`'s `types/input.d.ts` shape first to avoid outdated-guide structural mistakes.
3. Optional `Input<T>` fields under `exactOptionalPropertyTypes` need conditional-spread; never inline `field: maybeUndefined`.
4. Allow-list amendments captured inline in the runbook file's Refactor-budget paragraph, not as a separate decision elsewhere.
5. The `hulumi:controls` tag staged-migration completes in M3 — every M2 component (`OrgFoundation` + sub-components) ships without the tag and gains it as an additive M3 change.
6. The discriminated-union opt-in pattern (used for `acknowledgePublic`) generalizes: any "this is a footgun unless you mean it" knob in M2+ should use the same shape — separate `<Args>Safe` / `<Args>Risky` types unified at the public surface, with a runtime check in the constructor.
