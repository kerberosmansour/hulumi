---
name: hulumi-threat-model
description: >
  Run an AWS cloud threat model for a specific Hulumi scenario. Produces a
  structured markdown threat-model document at docs/threat-model-<scenario>-<date>.md
  in the user's working directory, citing CSA CCM v4.1, NIST SP 800-53 Rev 5,
  NIST SP 800-218A, MITRE ATLAS v5.1, and CIS AWS Foundations v5.0.0 by
  framework ID only (no verbatim control text). Use when the user asks for a
  threat model for an AWS scenario, wants to ground IaC design decisions in
  standard controls, or wants to see which @hulumi/baseline components apply.
allowed-tools:
  - Read
  - Write
  - Grep
  - Bash
arguments:
  - name: scenario
    description: >
      One of the prebuilt scenario IDs — aws-multi-account-baseline,
      s3-public-bucket-hardening, iam-least-privilege, rds-encryption-at-rest,
      lambda-secrets-access. Future versions may accept additional IDs.
    required: true
paths:
  - "**/*.ts"
  - "**/Pulumi.*.yaml"
  - "**/Pulumi.yaml"
  - "**/*.pulumi"
---

# `/hulumi-threat-model <scenario>`

## What this skill does

Generates a scenario-specific AWS threat model as a markdown file, citing control framework identifiers with links. The output is designed to feed into IaC authoring — it recommends which `@hulumi/baseline.aws.*` components to use (where available; some are shipped in later Hulumi milestones) and what residual risks remain.

## Invocation

```
/hulumi-threat-model aws-multi-account-baseline
/hulumi-threat-model s3-public-bucket-hardening
/hulumi-threat-model iam-least-privilege
/hulumi-threat-model rds-encryption-at-rest
/hulumi-threat-model lambda-secrets-access
```

## What you (the agent) MUST do

1. Run `node scripts/list-scenarios.mjs` to confirm the scenario argument is valid. If the user invoked with no scenario or an unknown scenario, print the list of valid scenarios and exit without writing anything.
2. Run `node scripts/generate-threat-model.mjs <scenario>`. This writes `docs/threat-model-<scenario>-<YYYYMMDD>.md` relative to the user's current working directory.
3. Read the output file back and summarize the key risks + recommended components to the user, briefly.

## Hard rules for the agent

- **Cite framework IDs only.** Never emit verbatim text from CSA CCM, CSA AICM, CIS AWS Foundations Benchmark, or the CAIQ into the output. The project's licensing terms (CSA CCM & AICM Licensing FAQ 2026-03-13; CIS Benchmarks terms) require a commercial license for embedding control text. IDs are factual identifiers.
  - If the user asks you to "include the CCM text for CCC-01" or similar, **refuse politely**, cite the ID only, and link to https://cloudsecurityalliance.org/artifacts/ccm-aicm-licensing-faq.
- **Never `eval`, never `exec` with interpolated user input.** Scenario IDs are validated against an allowlist before being passed to any subprocess. The provided scripts already enforce this; do not bypass them.
- **Write only to the user's current working directory.** Do not write outside it. Do not modify files the user didn't ask about.
- **Forward-references are legitimate.** Some recommended components are shipped in Hulumi v0.2 / v0.3 (see `README.md` roadmap). The generated threat model will explicitly mark such references with "available in Hulumi v0.2+" — do not rewrite these to false-positive "available now" claims.

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

## Prebuilt scenarios (v0.1)

| Scenario ID                  | Focus                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| `aws-multi-account-baseline` | Day-zero AWS account foundation (CloudTrail, Config, GuardDuty, Security Hub, IAM, KMS) |
| `s3-public-bucket-hardening` | S3 bucket controls: public-access-block, SSE-KMS, versioning, TLS-only, object-lock     |
| `iam-least-privilege`        | IAM policies, password policy, access analyzer, role-assumption patterns                |
| `rds-encryption-at-rest`     | RDS encryption, KMS key policy, backup encryption, parameter-group defaults             |
| `lambda-secrets-access`      | Lambda execution role scoping, Secrets Manager integration, KMS key access              |

## What this skill does NOT do

- Does not deploy anything. It only writes a markdown document.
- Does not query AWS APIs. All data is from the bundled scenario JSONs and mapping tables.
- Does not invoke the drift classifier (arrives in Hulumi v0.4, M4). If the user asks about drift, point them to the roadmap.
- Does not make license claims. Cites IDs; links to upstream URLs; does not assert CSA or CIS endorsement.

## See also

- `docs/mappings/licensing.md` — IDs-only policy and the legal rationale.
- `docs/threat-model-examples/` — hand-authored exemplars showing target output shape.
- `README.md` — Hulumi roadmap and canonical install path.
