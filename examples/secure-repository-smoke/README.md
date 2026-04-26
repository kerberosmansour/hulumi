# `secure-repository-smoke` — Hulumi-for-GitHub minimum example

Smoke-test example shipped in v1.1.0. Provisions two `SecureRepository`
instances (sandbox + startup-hardened tier) against a sandbox GitHub
org. Documents the canonical v1.1 wedge surface for users wiring up
Hulumi-for-GitHub for the first time.

## Prerequisites

- A sandbox GitHub org you control (recommend a NEW org — never run smoke
  examples against production orgs).
- A GitHub App installed on the sandbox org with: `Repository administration` →
  Read & Write, `Metadata` → Read. Note the App ID + installation ID; download
  the PEM private key.
- `pulumi` CLI logged into your stack backend.
- Node 20 LTS + pnpm 9.

## Running

```bash
cd examples/secure-repository-smoke
pnpm install
pulumi config set org your-sandbox-org
pulumi config set --secret github-app-id <id>
pulumi config set --secret github-app-installation-id <installation-id>
pulumi config set --secret github-app-pem "$(cat ~/.hulumi/sandbox-app.pem)"
pulumi up
```

After `pulumi up` succeeds, two repos exist in the sandbox org:

- `hulumi-smoke-sandbox` (private) — minimum hardening: ruleset with deletion +
  force-push protection.
- `hulumi-smoke-hardened` (private) — full startup-hardened defaults: signed
  commits required + push protection + secret scanning.

`pulumi destroy` cleanly removes both.

## What this example demonstrates

- **`@hulumi/baseline/github` import surface**: just one import for
  `SecureRepository`. `Tier` is re-exported from the same path so consumers
  don't bounce through `/aws`.
- **`acknowledgePublic` opt-in for public visibility**: commented-out
  example shows the discriminated-union shape. `acknowledgePublic: true` AND
  non-empty `publicJustification: string` required; partial opt-in fails at
  the constructor.
- **GitHub App auth as the IaC role default**: `appAuth` block on the
  provider; the App's installation token is short-lived (~1h TTL). For
  fine-grained PAT auth, swap to `token: cfg.requireSecret("github-pat")`.
- **Tier-gated security defaults**: secret scanning + push protection are on
  by default at startup-hardened, opt-in at sandbox.
- **`hulumi:component` + `hulumi:tier` + `hulumi:controls` description tags**:
  M3 added the controls tag; description carries all three so audit-trail
  consumers can correlate.

## Forward-references

- For org-level hardening (`OrgFoundation` with rulesets, Actions allowlist,
  OIDC sub-template), see `examples/org-foundation-smoke/` (planned for v1.1.x
  follow-up; the runbook M5 spec lists this as deferrable launch readiness).
- For drift detection wiring (`GithubWebhookFallbackAdapter`), see
  [`docs/cookbooks/github-webhook-drift.md`](../../docs/cookbooks/github-webhook-drift.md).
- For threat-model output, run
  `/hulumi-threat-model github-oidc-trust-cloud-account` after installing
  the skill (or any of the other 3 GitHub scenarios shipped in M1).
