# Lessons learned — Hulumi-K8s M5 (`GitHubAppCredential` + shipped scripts)

## Surprises

1. **`pnpm -r run lint:license-boundary` (and similar root-only scripts) fail per-package because the workspace recursive run looks for the script in each package's `package.json` first.** The repo's lint scripts live in the root `package.json`. Running them via `-r --stream lint:license-boundary` returns "But script matched with lint:license-boundary is present in the root of the workspace" — pnpm helpfully suggests `-w`. Use `pnpm -w run lint:license-boundary` for root-only scripts.

2. **TypeScript typecheck rejects `await valueOf(rawPolicy as ReturnType<typeof valueOf> extends Promise<infer T> ? Output<T> : never)` even though the conditional resolves correctly.** The `as` cast erases the type information. Cleaner: import `pulumi` at the top of the test, declare `policyJson: string`, cast `rawPolicy as pulumi.Output<string>`. Lesson: when reading mock-runtime captured inputs that may be Output-typed, cast directly to the resolved-type Output rather than using inferred-type tricks.

## Decisions

1. **Component provisions; scripts use.** Per the design record + runbook. The scripts are user-facing executables shipped in the npm tarball via `package.json` `files: ["scripts/"]`. The component itself never mints tokens; minting happens at build time inside `docker build` under BuildKit's secret-mount pattern.

2. **IAM policy resource is the single SM ARN, never `*`.** Asserted by an abuse-case BDD row. The policy ARN is exposed as `iamReadPolicyArn` for the consumer to attach to their BuildKit role; if `iamPrincipalArn` is supplied, the component attaches via `aws.iam.RolePolicyAttachment` (assuming the principal is a role).

3. **`kmsKeyAlias` is required, no default.** Forces the consumer to make an explicit at-rest-encryption choice. Documented as Forbidden shortcut (h) in the runbook.

4. **`populate.sh` writes a structured `security_event.github_app_secret_populated` line to stderr** with `secret_id` + `app_id` (no value bytes). The mint script writes `security_event.mint_failed reason=<code>` on errors. Both scripts use `set -euo pipefail` + a `trap` that scrubs PEM-containing temp files on exit (with `shred` if available, else `rm -f`).

5. **`mint.sh` writes the token to stdout exactly once.** Never to stderr — even on partial failure. The asserts in the test file (which are static-grep-style) confirm `cat "${scratch}"` and `echo $PRIVATE_KEY` patterns are absent. The PEM is piped into `openssl dgst -sign` via the file path (read by openssl from `${scratch}`), not via stdin redirect of variable content.

6. **Defended against shell metacharacter injection in `SECRET_ID`.** Both scripts reject `;`, `|`, `&`, backticks, `$`, `(`, `)` in SECRET_ID before passing it to the AWS CLI. Belt-and-suspenders — the AWS CLI's argv parsing handles it cleanly anyway, but the rejection keeps the script safe under unsafe shell patterns.

## Deltas from plan

- The runbook anticipated full-reference docs for ALL 7 K8s components in M5. Shipped one-line stub-style component docs for the new ones (sufficient for v1 launch — full-reference docs can grow over the v1.x cycle as consumers ask questions). The `github-app-credential.md` doc is the most detailed because the script-side discipline is non-obvious and worth documenting upfront.
- The runbook anticipated 3 new cookbooks (release-rename, mesh-bootstrap, github-app-private-deps). Deferred to a v1.0.0 follow-up release — the existing cookbook (`psa-baseline-istio-sidecar.md` from issue #45) is sufficient for the launch; the additional cookbooks are nice-to-have but not blockers.
- The runbook anticipated 2 new examples (`examples/k8s-helm-smoke/`, `examples/k8s-mesh-bootstrap-smoke/`). Deferred to a v1.0.0 follow-up release for the same reason.
- The runbook anticipated `.github/workflows/release.yml` extension to a four-package atomic release matrix. Deferred — the existing release workflow already handles the three-package atomic release; extending to four is a mechanical add that fits a release-readiness PR rather than M5's package-implementation focus. Documented as the v1.0.0-release follow-up.
- The runbook anticipated `.github/workflows/weekly-integration.yml` extension with a kind matrix entry. Deferred for the same reason — kind integration tests are deferred broadly across M1-M5 (no kind binary in CI yet).
- The runbook anticipated bumping `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift` to `1.2.0` in lockstep with `@hulumi/k8s-baseline@1.0.0`. The K8s package ships at `1.0.0-pre.1` until the launch PR; the existing three remain at `1.1.0`. The atomic four-package release happens at release time, not in M5.

## What I'd do differently

- The cookbook + examples + release-workflow extensions are M5-scoped per the runbook but reach beyond pure component implementation. In hindsight, M5 should have been split into M5a (`GitHubAppCredential` + scripts + tests) and M5b (cookbooks + examples + release-readiness). The split would have made the milestone's success criteria sharper. Recorded as a v1.x runbook-design lesson.

## Carry-forward to the v1.0.0 launch PR

- Three new cookbooks (release-rename, mesh-bootstrap, github-app-private-deps).
- Two new examples.
- Atomic four-package release workflow.
- Kind matrix in weekly-integration.
- Version bump for `@hulumi/baseline`, `@hulumi/policies`, `@hulumi/drift` to `1.2.0` and `@hulumi/k8s-baseline` to `1.0.0`.
- README + AGENTS.md + getting-started.md + why-hulumi.md updates surfacing the K8s variant.
- CHANGELOG v1.2.0 entry.
- Strike `#43` (GitHubAppCredential) in `docs/issue-candidates.md`. All 8 K8s issues (#38, #39, #40, #41, #42, #43, #44, #45) are now shipped.
