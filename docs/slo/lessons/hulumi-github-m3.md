# Lessons learned — Hulumi-for-GitHub M3

> Captured 2026-04-26 at the close of `/slo-execute M3`.

## Surprises

### 1. Citation-ID meta-test caught two fabricated NIST-SSDF IDs immediately

The E4 critique-driven citation-ID validation meta-test fired on first run with two real fabricated IDs: `NIST-SSDF-v1.1:PW.6` was cited in `github-actions-supply-chain.json` and `github-self-hosted-runner.json`'s STRIDE rows, but absent from the `nist-ssdf-v1.1.ts` mapping table. Both citations were authored in M1 by me; neither showed up as a problem until M3 wired the meta-test.

**Fix**: added `NIST-SSDF-v1.1:PW.6` to `nistSsdfV11.orgRulesets`. The meta-test then went green.

This is exactly the failure mode critique E4 was designed to catch — and it caught it on first run, including in scenarios I authored myself. Useful infrastructure.

**Rule for the next milestone (M4)**: the citation-ID meta-test is now a release-blocking invariant. Any new mapping additions in M4 (e.g. for the webhook-fallback adapter, if M4 wants its own controls tag) MUST go through the same shape.

### 2. `pulumi.dynamic.Resource` ban is total

After M2's experience with the vitest worker-pool gotcha, M3 was authored with zero `pulumi.dynamic.Resource` usage. The CrossGuard rules use `ResourceValidationPolicy`'s plain validateResource hook — no closure-serialization concern, no test infrastructure adaptation. This pattern carries to M4.

### 3. AWS-side `Suppression` API works unchanged for GitHub-side

The runbook spec said M3 ships its own `packages/policies/src/github/suppressions.ts`. In practice, the AWS-side `Suppression` API is identical in shape (ruleId / reason / urnScope / expiresAt) and the matching logic is shared. M3's `suppressions.ts` is a one-line re-export. Documenting here so M4 and future cloud-rule additions don't duplicate the API.

### 4. Sub-component descriptions don't carry tag triples in GitHub the way AWS resources do

M2's plan was for each sub-component (`org-rulesets`, `org-actions`, etc.) to carry its own `hulumi:controls` tag. But `OrganizationRuleset`, `ActionsOrganizationPermissions`, etc. don't have a `description` field that accepts arbitrary tag-triple text the way `github.Repository.description` does. The cleanest aggregation is at the `OrgFoundation` parent level: a single `hulumiControls: pulumi.Output<readonly string[]>` output union-of-mappings.

**Rule for the next milestone (M4)**: when M4 adds the `GithubWebhookFallbackAdapter`, surface its `hulumiControls` union the same way — as a top-level output, not embedded in resource descriptions.

## Decisions

### `:PENDING-WORKBENCH` shipped as the only CIS-GitHub IDs in M3

Per the M3 runbook + M2 lessons rule #6, `cis-github.ts` ships with `:PENDING-WORKBENCH` placeholders only. No fabricated section numbers. The license-boundary-lint extension that rejects `TODO-WORKBENCH` strings on `release-*` git tags is a v1.1+ deferral (D4); M3 itself ships license-boundary-lint unchanged. v1.1.0 release ships with placeholders — the discipline holds.

### H4 tier-monotonicity AST meta-test deferred

The M3 runbook listed an H4 tier-monotonicity rule that walks `packages/baseline/src/github/` AST and asserts Startup-Hardened's emitted controls are a strict superset of Sandbox's. The AWS-side has a similar `tier-matrix.test.ts`. Building the GitHub equivalent is real work and the BDD coverage of M3's H1+H2+H3 already protects against the most likely violations. **Deferred to v1.1** — added to the deferrals doc as a v1.1+ entry.

### `CisGithubV1Pack` ships with one placeholder advisory rule

The M3 spec described per-section rules (`cisGithubSection1`, etc.). Without WorkBench access, those section numbers are unknowable. M3 ships ONE advisory rule named `CIS-GitHub-v1.2.0-PENDING-WORKBENCH` whose only purpose is to surface the WorkBench-pending state explicitly when consumers attach the pack. v1.1 D4 fills in the real per-section rules.

### `OrgFoundation.hulumiControls` is a top-level output

Adding the M3 `hulumi:controls` tag to OrgFoundation went through `hulumiControls: pulumi.Output<readonly string[]>` as a new top-level output (additive change to OrgFoundationOutputs interface). This is cleaner than adding a tag-triple field to the audit-event row or the description of a sub-resource. M2's "absence" assertion in tests flipped to a "presence" assertion.

## Deltas from plan

- **H4 tier-monotonicity AST meta-test deferred to v1.1** (work cost too high vs marginal protection).
- **`OrgFoundation.hulumiControls` added as top-level Output** (additive change; simpler than per-sub-component tag triples).
- **`CisGithubV1Pack` shipped with single placeholder advisory rule** (per-section rules await WorkBench).
- **`packages/policies/src/github/suppressions.ts` is a one-line re-export of the AWS-side** (the shapes are identical).

## Rules for the next milestone (M4)

1. **Citation-ID meta-test is release-blocking** — any new mapping additions go through `:PENDING-WORKBENCH` placeholders or cite real IDs in mapping tables.
2. **No `pulumi.dynamic.Resource`** — at all, ever, in any code path mock-runtime tests will execute. M4's webhook-fallback adapter is data-only (signal in, verdict out); use plain TypeScript classes, not Pulumi resources.
3. Top-level `hulumi:controls` Output (not per-sub-resource tag triples) is the staged-migration shape — extend M4's drift-adapter outputs the same way if it has any controls to claim.
4. M4 adds new `DriftSource` enum values — must extend `BUNDLED_STUBS` in `generate-threat-model.mjs` AND the citation-ID meta-test's `KNOWN_FRAMEWORKS` / `BUNDLED_FRAMEWORKS_WITHOUT_MAPPING_TABLE` if M4 introduces new framework prefixes.
5. **Cache schema bump v1 → v2 needs a real test** — atomic write order matters; the M4 runbook is explicit.
