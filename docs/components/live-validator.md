# Live Validator CLI

`hulumi validate live` is the read-only runtime posture checker in `@hulumi/drift`. It complements authoring-time CrossGuard policy packs by turning live AWS organization, Pulumi state backend, EKS, and GitHub runner/environment posture into deterministic findings.

## Guarantees

- Read-only by construction in this milestone: provider adapters return findings and do not expose remediation hooks.
- Every finding has a stable `id`, `provider`, `severity`, `status`, `resource`, `message`, `evidence`, and `observedAt`.
- Provider adapters are bounded by timeout, concurrency, and per-provider page cap.
- Unknown provider state is emitted as `degraded`, never as `pass`.
- JSON, Markdown, and SARIF renderers redact secret-like evidence keys.

## Command

```bash
pnpm --filter @hulumi/drift build
node packages/drift/dist/cli.js validate live \
  --config docs/cookbooks/live-validator.example.json \
  --format json,markdown,sarif \
  --out-dir .hulumi-artifacts/live-validator
```

The package also publishes a `hulumi` binary:

```bash
hulumi validate live --config hulumi-live-validator.json --format json
```

## Config Shape

```json
{
  "schemaVersion": "hulumi.live-validator.config.v1",
  "providers": ["aws-org", "pulumi-state", "eks", "github"],
  "timeoutMs": 30000,
  "maxConcurrency": 2,
  "pageCap": 100,
  "outputMaxBytes": 1000000,
  "checks": []
}
```

Current provider identifiers are:

| Provider       | Scope                                                                |
| -------------- | -------------------------------------------------------------------- |
| `aws-org`      | AWS organization delegated-admin and account guardrail posture       |
| `pulumi-state` | Pulumi backend, secrets-provider, and state-bucket posture           |
| `eks`          | EKS endpoint, audit, Pod Identity, add-on, and node metadata posture |
| `github`       | GitHub environment, runner, and workflow governance posture          |

## Exit Codes

| Exit | Meaning                                                             |
| ---: | ------------------------------------------------------------------- |
|    0 | All configured checks passed or were intentionally skipped.         |
|    1 | At least one finding failed/degraded, or no checks were configured. |
|    2 | Usage/config error, such as an unknown provider.                    |

## Security Notes

- Do not place secret values in findings; the renderer redacts keys such as `token`, `secret`, `password`, `credential`, `kubeconfig`, and `accessKey`, but adapters should avoid collecting those values in the first place.
- Markdown escapes pipe, newline, and angle-bracket payloads so crafted repo or environment names cannot hide a finding.
- SARIF output is deterministic for the same report and includes only the sanitized evidence payload.

## Related Controls

Control references remain identifier-only: `C5`, `C8`, `C9`, `AC-2`, `AU-6`, `CM-8`, `SI-4`.
