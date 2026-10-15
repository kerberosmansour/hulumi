# Runbook: Cloudflare DNS-only policy proof

Status: M1 confirmed by the user's standing instruction to continue autonomously with the SLO skills.
Finding: `csf_9b1ef2cc0c1778b82f099fcd` — Cloudflare DNS-only policy trusts forged `PublicHostname` ancestry.
Base: `8e0799f6a6070c27e3b8ecd460dc0537067f59d9`.

## Problem

`CF_DNS_1_NO_DNS_ONLY_PUBLIC_APP_RECORD` returns clean whenever a DNS record's URN type chain contains `hulumi:cloudflare:PublicHostname`. That proves neither that a concrete parent resource is present nor that the DNS-only exposure was acknowledged with a non-empty justification. A caller can therefore create the same component type chain around a raw record and bypass the mandatory rule.

## Security boundary

The stack policy may accept a DNS-only public-application record only when the record has a concrete `PublicHostname` parent included in the evaluated stack, the parent targets the same normalized hostname, and the parent inputs explicitly set `purpose: "public-app"`, `proxied: false`, `acknowledgeDnsOnlyExposure: true`, and a non-empty `dnsOnlyJustification`. Type-chain ancestry alone is not evidence.

## M1 — bind exemption to acknowledged parent inputs

### Allowed files

- `docs/RUNBOOK-cloudflare-dns-policy-proof.md`
- `docs/slo/critique/cloudflare-dns-policy-proof-m1.md`
- `docs/slo/verify/cloudflare-dns-policy-proof-m1.md`
- `docs/slo/lessons/cloudflare-dns-policy-proof-m1.md`
- `docs/slo/completion/cloudflare-dns-policy-proof-m1.md`
- `packages/policies/src/cloudflare/hulumi-hardening-pack.ts`
- `packages/policies/tests/cloudflare/hulumi-cloudflare-hardening-pack.test.ts`
- `docs/components/cloudflare-policy-packs.md`
- `docs/components/public-hostname.md`

### Acceptance

1. CF_DNS_1 evaluates stack relationships and no longer accepts a record from its URN type chain alone.
2. A matching concrete `PublicHostname` parent passes only with explicit DNS-only acknowledgement and non-empty justification.
3. Missing parents, parents absent from the evaluated stack, wrong parent types, hostname mismatches, missing acknowledgement, and blank justification all fail closed.
4. Raw public-application records and forged logical-name ancestry remain violations; proxied records remain clean.
5. Existing scoped policy suppressions retain their behavior.
6. Focused and full policy-package tests, build, typecheck, lint, format, license-boundary lint, OSV, Semgrep, secret scan, exact-head CI, and merged-main Codex Security validation pass.

### Dependency admission

No dependency or lockfile change is allowed. Existing admitted dependencies may be reused for verification. The repository OSV gate still runs and fails closed.

### Out of scope

- Changes to `PublicHostname` construction, outputs, or resource tags.
- The separate secure-origin and DNSSEC findings.
- New suppression semantics, package version changes, publication, or Cloudflare mutation.
- CodeQL queries, Semgrep rules, or secret-scanning patterns.

### Evidence commands

```text
pnpm --filter @hulumi/policies test -- --run tests/cloudflare/hulumi-cloudflare-hardening-pack.test.ts
pnpm --filter @hulumi/policies test
pnpm --filter @hulumi/policies build
pnpm --filter @hulumi/policies typecheck
pnpm --filter @hulumi/policies lint
pnpm format:check
pnpm lint:license-boundary
python3 scripts/osv-dependency-gate.py --output <report>
```
