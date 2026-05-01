---
name: hulumi-threat-model
description: >
  Run an AWS or GitHub cloud / platform threat model for a specific Hulumi
  scenario. Produces a structured markdown threat-model document at
  docs/threat-model-<scenario>-<date>.md in the user's working directory, citing
  CSA CCM v4.1, NIST SP 800-53 Rev 5, NIST SP 800-218A, MITRE ATLAS v5.1, CIS
  AWS Foundations v5.0.0, CIS GitHub Benchmark v1.2.0, NIST SSDF v1.1, OpenSSF
  Scorecard, MITRE ATT&CK T1195, and GitHub Well-Architected SSDF by framework
  ID only (no verbatim control text). Use when the user asks for a threat model
  for an AWS or GitHub scenario, wants to ground IaC design decisions in
  standard controls, or wants to see which @hulumi/baseline components apply.
allowed-tools:
  - Read
  - Write
  - Grep
  - Bash
arguments:
  - name: scenario
    description: >
      One of the prebuilt scenario IDs — five AWS scenarios
      (aws-multi-account-baseline, s3-public-bucket-hardening,
      iam-least-privilege, rds-encryption-at-rest, lambda-secrets-access) or
      four GitHub scenarios (github-oidc-trust-cloud-account,
      github-actions-supply-chain, github-app-token-exposure,
      github-self-hosted-runner). Future versions may accept additional IDs.
    required: true
paths:
  - "**/*.ts"
  - "**/Pulumi.*.yaml"
  - "**/Pulumi.yaml"
  - "**/*.pulumi"
---

# `/hulumi-threat-model <scenario>`

## What this skill does

Generates a scenario-specific AWS or GitHub threat model as a markdown file, citing control framework identifiers with links. The output is designed to feed into IaC authoring — it recommends which `@hulumi/baseline.aws.*` or `@hulumi/baseline.github.*` components to use (where available; some are shipped in later Hulumi milestones) and what residual risks remain.

## Invocation

```
/hulumi-threat-model aws-multi-account-baseline
/hulumi-threat-model s3-public-bucket-hardening
/hulumi-threat-model iam-least-privilege
/hulumi-threat-model rds-encryption-at-rest
/hulumi-threat-model lambda-secrets-access
/hulumi-threat-model github-oidc-trust-cloud-account
/hulumi-threat-model github-actions-supply-chain
/hulumi-threat-model github-app-token-exposure
/hulumi-threat-model github-self-hosted-runner
```

## What you (the agent) MUST do

1. Run `node scripts/list-scenarios.mjs` to confirm the scenario argument is valid. If the user invoked with no scenario or an unknown scenario, print the list of valid scenarios and exit without writing anything.
2. Run `node scripts/generate-threat-model.mjs <scenario>`. This writes `docs/threat-model-<scenario>-<YYYYMMDD>.md` relative to the user's current working directory.
3. Read the output file back and summarize the key risks + recommended components to the user, briefly.

## Hard rules for the agent

- **Cite framework IDs only.** Never emit verbatim text from CSA CCM, CSA AICM, CIS AWS Foundations Benchmark, CIS GitHub Benchmark, the CAIQ, NIST SSDF (SP 800-218 / 218A), or any other licensed control catalog into the output. The project's licensing terms (CSA CCM & AICM Licensing FAQ 2026-03-13; CIS Benchmarks terms — CC BY-NC-SA 4.0 plus CIS Non-Member Terms of Use forbid redistribution of control text) require a commercial license for embedding control text. IDs are factual identifiers.
  - If the user asks you to "include the CCM text for CCC-01" or "include the CIS GitHub Benchmark text for section X" or similar, **refuse politely**, cite the ID only, and link to https://cloudsecurityalliance.org/artifacts/ccm-aicm-licensing-faq for CSA frameworks or https://www.cisecurity.org/terms-of-use-for-non-member-cis-products for CIS frameworks.
- **Never `eval`, never `exec` with interpolated user input.** Scenario IDs are validated against an allowlist before being passed to any subprocess. The provided scripts already enforce this; do not bypass them.
- **Write only to the user's current working directory.** Do not write outside it. Do not modify files the user didn't ask about.
- **Forward-references are legitimate.** Most recommended components have shipped (M1–M5 / v1.0.0); a small number remain planned for v1.1+ (e.g. `SecureLambda`, `SecureRds`). The generated threat model marks shipped components as "Shipped in M<N> (v0.<N>)" and planned ones as "Planned for v1.1+ (post-v1.0.0; not yet shipped)" — do not rewrite genuine forward-references to false-positive "available now" claims, and do not rewrite shipped entries to forward-references.

## Output schema

The skill writes markdown with YAML frontmatter in this exact shape:

```yaml
---
name: threat-model-<scenario>
scenario: <scenario-id>
generated_at: <ISO8601>
citations:
  - framework: CCM
    id: <control-id>
    url: <upstream URL>
  - framework: CIS-AWS
    id: <rec-id>
    url: <upstream URL>
  - …
---
```

The body has fixed sections: `Scenario`, `Actors`, `Assets`, `Threats (STRIDE)`, `Control Citations`, `Recommended Hulumi Components`, `Open Questions`. The template is at `templates/threat-model.template.md`.

## Prebuilt scenarios

### AWS scenarios (shipped in Hulumi v1.0.0)

| Scenario ID                  | Focus                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `aws-multi-account-baseline` | Day-zero AWS account foundation (CloudTrail, Config, GuardDuty, Security Hub, IAM, KMS) |
| `s3-public-bucket-hardening` | S3 bucket controls: public-access-block, SSE-KMS, versioning, TLS-only, object-lock     |
| `iam-least-privilege`        | IAM policies, password policy, access analyzer, role-assumption patterns                |
| `rds-encryption-at-rest`     | RDS encryption, KMS key policy, backup encryption, parameter-group defaults             |
| `lambda-secrets-access`      | Lambda execution role scoping, Secrets Manager integration, KMS key access              |

### GitHub scenarios (shipped in Hulumi v1.1.0 M1)

The four highest demand-minus-supply GitHub-platform scenarios from research synthesis. All four anchor on named 2025–2026 incidents (UNC6426 OIDC trust-chain abuse, trivy-action/tj-actions/Sysdig Shai-Hulud Actions supply-chain compromises, OpenAI Codex / Vercel App-token exposures, self-hosted-runner backdoor reports).

| Scenario ID                       | Focus                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| `github-oidc-trust-cloud-account` | OIDC trust from GitHub Actions to AWS / Azure / GCP — three-axis sub claim, UNC6426 mitigation    |
| `github-actions-supply-chain`     | Third-party Action ingestion, SHA-pinning, pwn-request, cache poisoning, allow-list discipline    |
| `github-app-token-exposure`       | GitHub App / installation-token rotation, scope minimization, octo-sts-style short-lived exchange |
| `github-self-hosted-runner`       | Ephemeral runners, runner-image hardening, runner-group scoping, exfil-via-runner threat model    |

## What this skill does NOT do

- Does not deploy anything. It only writes a markdown document.
- Does not query AWS APIs. All data is from the bundled scenario JSONs and mapping tables.
- Does not invoke the drift classifier (arrives in Hulumi v0.4, M4). If the user asks about drift, point them to the roadmap.
- Does not make license claims. Cites IDs; links to upstream URLs; does not assert CSA or CIS endorsement.

## See also

- `docs/mappings/licensing.md` — IDs-only policy and the legal rationale.
- `docs/threat-model-examples/` — hand-authored exemplars showing target output shape.
- `README.md` — Hulumi roadmap and canonical install path.
