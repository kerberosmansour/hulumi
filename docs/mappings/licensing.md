# Mapping-table licensing posture — IDs only, no verbatim prose

Hulumi cites framework control identifiers by **ID only**. Every mapping table in this directory (`ccm-v4.1.md`, `cis-aws-v5.0.md`, `nist-800-53-r5.md`, `nist-800-218a.md`, `atlas-v5.1.md`) contains three columns:

1. `id` — the canonical control identifier (e.g. `CCM:IAM-01`, `CIS-AWS-v5.0.0:2.1.2`, `NIST-800-53-r5:AC-6`, `ATLAS:AML.T0080`).
2. `paraphrased title` — a short **paraphrased** title authored by Hulumi maintainers. Not verbatim from the source.
3. `url` — an upstream URL to the authoritative artefact.

## Why this discipline

- **CSA CCM v4.1 and CSA AICM v1** are published under terms that require a commercial license for embedding control text, CAIQ questions, or Implementation Guidelines prose in a distributed product. Internal reference is free. See the [CCM & AICM Licensing FAQ (2026-03-13)](https://cloudsecurityalliance.org/artifacts/ccm-aicm-licensing-faq). The FAQ is explicit on prose embedding and **silent on bare control-ID citation**; industry analogs (FedRAMP, NIST OSCAL) treat IDs as factual identifiers. Written CSA confirmation of ID-only reuse is tracked as a maintainer follow-up in the v1.0.0 launch plan (`docs/launch/csa-outreach.md`, arriving in M5).
- **CIS AWS Foundations Benchmark** PDFs are freely available for non-commercial use. Text embedding is not part of the free grant. See the [CIS Benchmarks landing](https://www.cisecurity.org/benchmark/amazon_web_services) and [CIS Benchmarks page](https://www.cisecurity.org/cis-benchmarks).
- **NIST SP 800-53 Rev 5**, **NIST SSDF SP 800-218** (and **SP 800-218A**), and **MITRE ATLAS** are public-domain or reuse-with-attribution; we could quote them freely, but we still prefer ID-only for consistency with CCM/CIS and for stability (titles may edit; IDs tend not to).

## What maintainers MUST NOT do

- Do not paste control text from CCM v4.1, AICM v1, CAIQ, or CIS benchmarks into any file under `skills/` or `packages/`.
- Do not paste control text into `docs/mappings/*.md` either — the "paraphrased title" column is prose authored by Hulumi; the upstream authoritative title is reachable via the URL column.
- Do not add "distinctive" fragments from those frameworks even as comments or commit messages.

## How this is enforced

- `scripts/license-boundary-lint.mjs` scans `skills/` and `packages/` for known-distinctive verbatim prose and fails on any match.
- `docs/mappings/*.md` is conventionally reviewed by a CODEOWNER on every PR touching these files.
- CI invokes the license-boundary lint on every PR and release.

## Open questions

- Does CSA explicitly consider bare control-ID citation as within the free-reuse grant? Tracked as the M5 launch-readiness outreach to `research@cloudsecurityalliance.org`.
- Does CIS explicitly address ID-only citation in terms of use? The legacy CIS T&C page currently returns 404; tracked as M5 outreach.
