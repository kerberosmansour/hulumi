# Completion — Policy suppression integrity M1

Date: 2026-10-15
Status: locally complete; PR and merged-main audit pending

## Delivered

- The public `Suppression` type now requires `urnScope` and `expiresAt`.
- The shared matcher requires a matching nonblank rule, nonblank reason,
  explicit exact resource/bounded prefix/stack scope, canonical future expiry,
  and a valid evaluation clock.
- Thirty-five direct BDD cases cover missing, malformed, noncanonical, expired,
  mismatched, exact, prefix, and stack partitions.
- AWS, GitHub, Cloudflare, Kubernetes, RBAC, and operations fixtures now carry
  bounded future records with correct public IDs.
- Cookbooks, component references, package README, and changelog document the
  fail-closed contract and do not claim an external audit sink.

## Evidence

- Baseline consumers: 291/291.
- RED: 11 intended failures and 14 passing controls.
- GREEN: direct 35/35; policy package 530/530.
- Nineteen runnable workspace projects passed build, typecheck, sequential
  tests, lint, formatting, and license checks; 1,389 tests passed with existing
  skips/todo unchanged.
- OSV-Scanner 2.7.0: two unchanged lockfiles, 575 package occurrences, zero
  vulnerability or `MAL-*` findings; SHA-256
  `10c55dbf5e83d5268eb5fa37e826477ae5eb4a972a2fe38e0a6832f28be95df4`.
- Semgrep 1.156.0: 210 rules, nine TypeScript targets, zero findings/errors;
  SHA-256 `f0809f1b611beb7e65edbbc8879c401a262adf44825bfe654b7a50f6005fb8d0`.
- No dependency, manifest, lockfile, version, publication, provider resource, or
  live-cloud change.

## Remaining gates

- Commit the exact 21-file allow-list with a valid signature and DCO trailer.
- Pass exact-head GitHub checks, merge only that head, and audit the exact
  merged-main commit with xhigh Codex Security before AgentBus completion.
