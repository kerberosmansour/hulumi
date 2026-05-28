---
title: Run the live validator
description: Produce JSON, Markdown, and SARIF posture artifacts from read-only live-validation findings.
---

# Run the live validator

## When to use this recipe

Use this when you want a scheduled, deterministic artifact showing whether live cloud and platform posture still matches Hulumi's expected guardrails. The command is advisory: it reports findings, writes artifacts, and exits non-zero on failed or degraded posture.

## Preconditions

- `@hulumi/drift` is installed or you are running inside this repository.
- You have a validator config that lists the scopes you want checked.
- Any real provider adapter you wire in uses read-only credentials only.

## Steps

1. Start from the example config:

   ```bash
   cp docs/cookbooks/live-validator.example.json hulumi-live-validator.json
   ```

2. Build the drift package:

   ```bash
   pnpm --filter @hulumi/drift build
   ```

3. Run the validator and write artifacts:

   ```bash
   node packages/drift/dist/cli.js validate live \
     --config hulumi-live-validator.json \
     --format json,markdown,sarif \
     --out-dir .hulumi-artifacts/live-validator
   ```

4. In CI, upload `.hulumi-artifacts/live-validator/` as the scheduled advisory artifact.

## Verify

- `hulumi-live-validation.json` parses as JSON and contains `schemaVersion: "hulumi.live-validator.report.v1"`.
- `hulumi-live-validation.md` shows the same finding count as JSON.
- `hulumi-live-validation.sarif` is byte-equivalent across repeated runs with the same findings.
- Any provider timeout produces a `degraded` finding and a non-zero exit, not a clean pass.

## Troubleshooting

**`no checks configured`** means the config has no `checks` for the selected providers. Add checks or adjust `--provider`.

**`unsupported provider`** means the provider is not one of `aws-org`, `pulumi-state`, `eks`, or `github`.

**Artifact is too large** means the output exceeded `outputMaxBytes`. Narrow provider scope or reduce page caps.

## See also

- [live-validator.md](../components/live-validator.md) - command reference and finding schema.
- [drift-detection.md](./drift-detection.md) - drift classifier cookbook.
- [integration-testing.md](../integration-testing.md) - credential-gated runtime validation patterns.
