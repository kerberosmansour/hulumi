# SLO critique — Drift evidence-window contract M1

Runbook: `docs/RUNBOOK-drift-evidence-window-contract.md`
Date: 2026-10-15
Threat-model mode: degraded. This bounded correction has no frozen drift-window `.slo.json`; the abuse ID is defined in the runbook and no schema-stability claim is made.

## CEO pass

| id  | persona | category     | runbook section | finding                                                                                             | concrete scenario                                                                                                | recommendation                                                      | resolution                                                     |
| --- | ------- | ------------ | --------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| C1  | CEO     | reduce-scope | Compatibility   | Renaming `before` and `after` would turn a bounded security correction into a public API migration. | Existing callers compile against those property names even though the implementation currently inverts defaults. | Preserve names, document polarity, and centralize their validation. | accepted under the standing autonomous maintenance instruction |

## Engineering-lead pass

| id  | persona          | category | runbook section  | finding                                                                                         | concrete scenario                                                                                                | recommendation                                                                                           | resolution            |
| --- | ---------------- | -------- | ---------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------- |
| E1  | engineering lead | auto-fix | Default window   | Calling `Date.now()` twice creates an unnecessary moving boundary even after polarity is fixed. | A test or overloaded clock crosses a millisecond boundary and adapters receive values derived from two instants. | Capture `now` once and derive both ISO timestamps from that value.                                       | applied to contract   |
| E2  | engineering lead | ask      | Adapter behavior | Throwing from direct adapters would change their established degraded-signal contract.          | A caller expects `{ ok: false }` for lookup failures and instead receives an unhandled exception.                | Validate in a pure helper, throw at classifier boundary, and convert errors to degraded adapter signals. | accepted; BDD-M1-2/4  |
| E3  | engineering lead | auto-fix | Integration test | The live CloudTrail integration fixture encodes the same reversed bounds.                       | Fixing validation breaks the fixture before it can prove real event delivery.                                    | Correct the fixture to use mutation start as `after` and future slack as `before`.                       | applied to allow-list |

## Security pass

| id  | persona  | category | runbook section   | finding                                                                                               | concrete scenario                                                                                                    | recommendation                                                                                           | resolution               |
| --- | -------- | -------- | ----------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------ |
| S1  | security | ask      | Security contract | **Severity: high — CWE-20.** The default evidence interval is empty under every adapter's polarity.   | An out-of-band mutation occurs during the preceding day, but `after > before` causes audit lookup to return nothing. | Make ordered default construction a single shared security invariant and prove it at adapter boundaries. | accepted; primary repair |
| S2  | security | ask      | Failure behavior  | Invalid explicit timestamps currently flow into provider, git, or event filtering inconsistently.     | A malformed or reversed caller window silently suppresses evidence and can produce a clean-looking verdict.          | Reject non-finite dates and reversed intervals before any evidence-source side effect.                   | accepted                 |
| S3  | security | ask      | Direct adapters   | Fixing only the classifier leaves direct CloudTrail callers vulnerable to the same default inversion. | A consumer instantiates `CloudTrailAdapter` directly and omits `window`.                                             | Route direct defaults through the same helper and test the exact lookup arguments.                       | accepted                 |

### Expanded finding S1

- **Severity: high; CWE-20 — Improper Input Validation.**
- **Evidence:** the classifier and CloudTrail direct default store the older instant in `before` and the newer instant in `after`, while Git, webhook filtering, and the CloudTrail API treat `after` as the lower bound and `before` as the upper bound.
- **Threat link:** `tm-hulumi-drift-empty-evidence-window`; eliminated for classifier and direct adapter calls after shared ordered validation. Provider delivery gaps remain governed by existing probe behavior.
- **Variant analysis:** default, equal, valid ordered, reversed, invalid lower, invalid upper, Git mapping, CloudTrail mapping, and webhook in-range forms.
- **Remediation proof:** focused BDDs, full drift regressions, exact-head CI, and exact merged-main Codex Security rescan.

## Design pass

Skipped: no UI surface.

## Critique decision

M1 remains one bounded milestone. The user's standing instruction authorizes continued defensive execution. The allow-list covers one shared helper, compatible type/docs updates, all three affected adapter boundaries, the inverted integration fixtures, and SLO evidence files. Implementation may proceed BDD-first.
