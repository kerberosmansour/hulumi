# M2 completion summary — Hulumi-for-GitHub

> Closed 2026-04-26 by `/slo-execute M2`.

## Goal achieved

After M2, `@hulumi/baseline.github.OrgFoundation` ships as a composing `ComponentResource` mirroring AWS-side `AccountFoundation`. A single `new OrgFoundation(name, args)` provisions an org-level ruleset (signed-commits + deletion + force-push at startup-hardened), the Actions allowlist with the 2025-08-15 SHA-pin policy on at startup-hardened, the OIDC subject-claim customization template defaulted to the three-axis safe shape (UNC6426 mitigation), and an encapsulated `securityDefaults` surface backed by either `OrganizationSettings` (flat-fields, default) or a thin `ComponentResource` placeholder for the GHAS Code Security Configurations REST surface (CSC, switchable). Backend swap is a one-line argument change with no public output-shape difference.

## Files changed

### New (8)

- `packages/baseline/src/github/org-foundation.ts`
- `packages/baseline/src/github/org-foundation.args.ts`
- `packages/baseline/src/github/org-foundation.outputs.ts`
- `packages/baseline/src/github/org-rulesets.ts`
- `packages/baseline/src/github/org-actions.ts`
- `packages/baseline/src/github/org-oidc-template.ts`
- `packages/baseline/src/github/org-security-defaults.ts`
- `packages/baseline/tests/github/org-foundation.test.ts`
- `packages/baseline/tests/integration/github/org-foundation.integration.test.ts`
- `docs/slo/lessons/hulumi-github-m2.md`
- `docs/slo/completion/hulumi-github-m2.md`

### Modified (4)

- `packages/baseline/src/github/index.ts` — re-export `OrgFoundation`, `ORG_FOUNDATION_COMPONENT_TYPE`, args / outputs types, `HULUMI_OIDC_DEFAULT_CLAIM_KEYS`
- `packages/baseline/tests/setup.ts` — mock state for `OrganizationRuleset`, `ActionsOrganizationPermissions`, OIDC template, `OrganizationSettings`, and `hulumi:baseline:github:CodeSecurityConfiguration`
- `docs/slo/completed/RUNBOOK-hulumi-github.md` Milestone Tracker — M2 → in_progress (start) → done (close)
- `docs/slo/runbook-milestones/hulumi-github-v1.1-deferrals.md` — added D1.5 (real REST hooks for CSC backend, deferred from M2 due to vitest dynamic-resource gotcha)

## Tests added

- 14 mock-runtime BDD scenarios for `OrgFoundation` (`packages/baseline/tests/github/org-foundation.test.ts`):
  - 3 happy paths: startup-hardened flat-fields, startup-hardened CSC, sandbox tier minimum
  - 1 invalid input (invalid tier)
  - 1 invalid input (Actions allowlist patterns with shell metachars)
  - 5 abuse cases: OIDC default snapshot-pinned, OIDC wildcard rejected, SHA-pin default, backend-swap parity, audit-row token redaction (via direct `redactTokens` import)
  - 1 invalid input (empty OIDC axis)
  - 3 schema locks: component-type string, output shape backend-opaque, `hulumi:controls` deliberately omitted
- 2 integration test stubs (env-gated, skip green): one per backend in `packages/baseline/tests/integration/github/org-foundation.integration.test.ts`

## Test results

```
packages/policies test:   2 test files, passed
packages/drift test:      10 test files, passed
tests/skill-bdd test:     2 test files, 24 tests, all pass
packages/baseline test:   8 test files, 43 passed | 8 skipped (4 pre-existing AWS skips + 2 M1 GitHub integration skips + 2 M2 GitHub integration skips)
examples/drift-classify-smoke test:  1 file passed
examples/secure-bucket-smoke test:   1 file passed
examples/account-foundation-smoke test:  1 file passed

pnpm -r typecheck:                Done across all 9 workspace projects
pnpm -r lint:                     Done (0 errors, 0 warnings)
pnpm run lint:license-boundary:   OK
pnpm run lint:exact-pin-guard:    OK (4 @pulumi/* deps match pinned hashes)
```

## Documentation updated

- M2 runbook file Evidence Log filled
- Master runbook Milestone Tracker updated to `done` for M2
- Lessons file written (4 surprises + 3 decisions + 7 rules-for-next-milestone)
- v1.1 deferrals doc gained D1.5 (CSC real REST hooks)

## Demo gate (deferred follow-ups)

- **Sandbox-org integration runs (both backends)**: deferred — same env-var gating as M1 (HULUMI_INTEGRATION + HULUMI_GITHUB_SANDBOX_ORG + HULUMI_GITHUB_APP_*) plus a new `HULUMI_GITHUB_SANDBOX_BILLING_EMAIL` for the `OrganizationSettings` requirement. Both `describe.skipIf(!ENABLED)` blocks ship with skip-with-reason markers. M5 launch readiness includes the first real sandbox runs.
- **CSC backend real REST hooks**: D1.5 in v1.1 deferrals — landed alongside D1's audit-log adapter when dynamic-resource testing infrastructure is solved once for both surfaces.

## Forward-references opened

- M3 will add the `hulumi:controls` tag to all M1 + M2 components AND replace the `:PENDING-WORKBENCH` placeholder IDs in scenario JSONs with real CIS GitHub Benchmark IDs (gated on WorkBench access). M3's `G_OIDC_1` rule reuses `assertOidcTemplateSafe` from M2 (no duplication).
- M4's webhook fallback adapter exercises org-level webhooks configured by `OrgFoundation` (M2 ships the wiring; M4 ships the consumer).
- M5 SLSA-L3 release of the v1.1.0 atomic three-package set covers all M1 + M2 surfaces.

## Allow-list amendment captured

M2 allow-list amendment: `pulumi.dynamic.Resource` in the CSC backend was reframed to `pulumi.ComponentResource`. The runbook M2 design rule's "vitest worker-pool gotcha" mitigation ("dependsOn instead of dynamic resources") turned out to be insufficient — the failing path is `pulumi/runtime/closure/createClosure.ts` calling `node:trace_events` at construction time, not at use-via-dependsOn time. The fix preserves the M2 BDD contract ("a resource of this type is registered") while deferring real REST hooks to v1.1 D1.5.
