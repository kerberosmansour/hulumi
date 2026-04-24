# SEEDED FIXTURE — DO NOT EXPAND

This file seeds the license-boundary lint with a known-distinctive CCM-style fragment.

The lint MUST fail when this file is present under `skills/` or `packages/`. In the test, we
temporarily copy this file to `skills/hulumi-threat-model/.lint-fixture-verbatim.md`, run the
lint, assert failure, then remove the copy and assert pass.

The fragment is short and purely demonstrative; it is sourced from public representative
samples of CCM v4.1 control prose (the lint fixture list in `scripts/license-boundary-lint.mjs`
itself contains the same sentence-opener). It exists here so the test can verify the lint
tooling catches misuse — not to reproduce CCM content.

SEEDED CONTENT BELOW — THIS IS THE MATCH:

A policy and procedures for cryptographic key management shall be established and maintained.

END SEEDED CONTENT.
