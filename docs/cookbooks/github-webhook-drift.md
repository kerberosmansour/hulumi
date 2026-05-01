# Cookbook — wiring GitHub webhooks into `GithubWebhookFallbackAdapter`

> Operational cookbook for the Hulumi-for-GitHub drift adapter shipped in v1.1.0. Two wiring patterns: AWS Lambda + API Gateway, and Cloudflare Worker. Plus the HMAC-secret-rotation runbook step.

## Why this cookbook exists

`@hulumi/drift.GithubWebhookFallbackAdapter` is push-model — it expects webhook events to arrive at a receiver you operate, then ingests them via `recordEvent()`. Hulumi does NOT host webhook receivers; that wiring is yours.

This cookbook is the one operational reference for getting from "I have webhooks fired by GitHub" to "the drift classifier knows about my GitHub state changes." If you're on GitHub Enterprise Cloud and want full audit-log REST fidelity instead, see the v1.1 deferral list — D1 ships the classic-PAT-authed audit-log adapter when WorkBench / GHEC infrastructure is in place.

## What you'll need

- A non-GHEC GitHub plan (Free / Pro / Team) — this adapter is the fallback for tiers without audit-log REST.
- A GitHub App or fine-grained PAT installed on the org you want to monitor (Hulumi recommends GitHub App; M2 cookbook covers App provisioning).
- A receiver that GitHub can reach over HTTPS — AWS Lambda + API Gateway, Cloudflare Worker, or an existing webhook collector.
- A webhook secret stored in your secret manager — AWS Secrets Manager, Pulumi ESC, Cloudflare Workers KV (encrypted), etc.

## Set up the webhook in GitHub

In your `OrgFoundation` Pulumi program (M2), provision the org-level webhook subscribing to the seven drift-relevant events:

```typescript
import * as github from "@pulumi/github";
import { OrgFoundation } from "@hulumi/baseline/github";
import * as pulumi from "@pulumi/pulumi";

const cfg = new pulumi.Config();
const webhookSecret = cfg.requireSecret("hulumi-github-webhook-secret");

const provider = new github.Provider("github-iac", {
  owner: "your-org",
  appAuth: { /* GitHub App auth here */ },
});

const foundation = new OrgFoundation("acme-org", {
  tier: "startup-hardened",
  organization: "your-org",
  billingEmail: "billing@acme.example",
  provider,
});

new github.OrganizationWebhook(
  "drift-webhook",
  {
    configuration: {
      url: "https://drift.your-org.example/github-webhooks",
      contentType: "json",
      insecureSsl: false,
      secret: webhookSecret,
    },
    events: [
      "branch_protection_rule",
      "repository_ruleset",
      "secret_scanning_alert",
      "dependabot_alert",
      "code_scanning_alert",
      "member",
      "organization",
    ],
    active: true,
  },
  { parent: foundation, provider },
);
```

The `secret` field carries the HMAC key that `GithubWebhookFallbackAdapter` validates. Keep it in a Pulumi secret config (or AWS Secrets Manager / Pulumi ESC) — never a literal in code, never an env var copied from a chat log.

## Pattern 1 — AWS Lambda + API Gateway

Receiver implementation (Node.js 20):

```typescript
import { GithubWebhookFallbackAdapter } from "@hulumi/drift";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const sm = new SecretsManagerClient({});
let cachedSecret: string | undefined;

async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const response = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.WEBHOOK_SECRET_ARN! }),
  );
  cachedSecret = response.SecretString!;
  return cachedSecret;
}

const adapter = new GithubWebhookFallbackAdapter({
  webhookSecret: () => cachedSecret ?? "", // populated lazily
  hulumiTier: "startup-hardened",
});

export const handler = async (event: APIGatewayProxyEventV2) => {
  // Refresh the secret if not cached. Lazy-load avoids cold-start latency
  // on the secret-fetch path.
  if (!cachedSecret) await getSecret();

  const result = adapter.recordEvent({
    body: event.body ?? "",
    signature: event.headers["x-hub-signature-256"],
    deliveryId: event.headers["x-github-delivery"] ?? "",
    eventType: event.headers["x-github-event"] ?? "",
    installationId: event.headers["x-github-hook-installation-target-id"] ?? undefined,
    receivedAt: new Date().toISOString(),
  });

  if (!result.ok) {
    // Always 200 to avoid GitHub retry loops on poison events; the
    // structured stderr audit row + reason tells the operator what
    // happened without leaking info to the attacker.
    console.warn(`webhook rejected: ${result.reason}`);
    return { statusCode: 200, body: "" };
  }
  return { statusCode: 200, body: "" };
};
```

Pulumi program (`SecureRepository`-flavored):

```typescript
const fn = new aws.lambda.Function("drift-receiver", { /* ... */ });
const api = new aws.apigatewayv2.Api("drift-api", { protocolType: "HTTP" });
new aws.apigatewayv2.Integration(/* fn → api */);
```

Full minimal Pulumi program is at [`examples/secure-repository-smoke/`](../../examples/secure-repository-smoke/) — adapt the receiver wiring to your stack.

## Pattern 2 — Cloudflare Worker

Cheaper, lower-latency, no AWS dependency. Worker code:

```javascript
import { GithubWebhookFallbackAdapter } from "@hulumi/drift";

const adapter = new GithubWebhookFallbackAdapter({
  webhookSecret: () => env.HULUMI_WEBHOOK_SECRET, // Worker env binding
  hulumiTier: "startup-hardened",
});

export default {
  async fetch(request, env) {
    const body = await request.text();
    const result = adapter.recordEvent({
      body,
      signature: request.headers.get("x-hub-signature-256") || undefined,
      deliveryId: request.headers.get("x-github-delivery") || "",
      eventType: request.headers.get("x-github-event") || "",
      installationId: request.headers.get("x-github-hook-installation-target-id") || undefined,
      receivedAt: new Date().toISOString(),
    });
    if (!result.ok) console.warn(`rejected: ${result.reason}`);
    return new Response("", { status: 200 });
  },
};
```

The secret is bound via Wrangler / Cloudflare dashboard. Rotation is done by re-uploading the binding without touching the worker code.

## HMAC secret rotation

Per critique E3, the adapter detects rotation drift: after 3 consecutive HMAC failures from the same `(installation_id, repo_full_name)` source, it emits `security_event.webhook_secret_rotation_suspected` to stderr. Rotation runbook:

1. Generate a new secret (e.g., `openssl rand -hex 32`).
2. Update the secret in your secret store (AWS Secrets Manager / Pulumi ESC / Cloudflare Workers KV).
3. Run `pulumi up` to push the new value to the GitHub-side webhook configuration.
4. Within seconds, the receiver picks up the new secret on its next cold start (or via a deliberate cache-bust if you cached it in memory).
5. Watch stderr for `webhook_secret_rotation_suspected` rows. If they continue past the rotation completion, the secret hasn't propagated; investigate.

GitHub does not allow zero-downtime secret rotation natively (only one secret per webhook). The adapter's structured detection is the next-best-thing UX.

## OIDC trust to the cloud account

The `github-oidc-trust-cloud-account` cookbook (defer to v1.1.x) covers the AWS / Azure / GCP trust-policy authoring against the `OrgFoundation`-managed `ActionsOrganizationOidcSubjectClaimCustomizationTemplate`. Until that cookbook lands, the four threat-model exemplars at [`docs/threat-model-examples/github-*.md`](../threat-model-examples/) document the safe shape — short version: AWS uses `StringEquals` (not `StringLike`) on `sub`, and the value contains all three axes `repo`, `job_workflow_ref`, `environment`. M3's `G_OIDC_1` rule rejects anything else at preview-time.

## Verifying the wiring

After the receiver is deployed and the GitHub webhook subscription is provisioned:

1. Fire a manual test from GitHub: org settings → Webhooks → recent deliveries → "Redeliver."
2. Check the receiver logs for `security_event` rows from `GithubWebhookFallbackAdapter`. A successful delivery emits no rejection-shaped rows; failures emit one of `webhook_signature_failed`, `webhook_payload_max_size_exceeded`, `webhook_payload_max_nesting_depth_exceeded`, `webhook_replay_blocked`, `webhook_unsigned_accepted` (sandbox tier only), or `webhook_secret_rotation_suspected`.
3. In a Pulumi-state-aware drift check, run `DriftClassifier.classify(...)` and observe the verdict carries `tierDegraded: true` (you're on a non-GHEC tier — the truth is non-suppressible).

## v1.1 deferrals worth knowing about

- **D1** — Classic-PAT-authed audit-log REST adapter. Higher-fidelity drift detection on GHEC. Replaces the webhook fallback when available.
- **D1.5** — Real REST hooks for the GHAS Code Security Configurations backend in `OrgFoundation`. Currently a `ComponentResource` placeholder.
- **D5** — Threat-model skill scenario for GitHub Apps with broad org-admin scopes (post-Vercel-April-2026).

See [`docs/slo/runbook-milestones/hulumi-github-v1.1-deferrals.md`](../slo/runbook-milestones/hulumi-github-v1.1-deferrals.md) for the full list.
