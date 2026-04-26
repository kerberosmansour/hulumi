---
name: threat-model-github-self-hosted-runner
scenario: github-self-hosted-runner
generated_at: 2026-04-26T00:00:00.000Z
citations:
  - framework: CCM
    id: CCM:DSI-01
    url: https://cloudsecurityalliance.org/artifacts/cloud-controls-matrix-v4-1
  - framework: NIST-SSDF-v1.1
    id: NIST-SSDF-v1.1:PW.6
    url: https://csrc.nist.gov/pubs/sp/800/218/final
  - framework: OpenSSF-Scorecard
    id: OpenSSF-Scorecard:Maintained
    url: https://scorecard.dev/
  - framework: MITRE-ATTCK
    id: MITRE-ATTCK:T1195
    url: https://attack.mitre.org/techniques/T1195/
  - framework: GitHub-Well-Architected
    id: GitHub-Well-Architected:PO.5
    url: https://wellarchitected.github.com/library/scenarios/nist-ssdf-implementation/
  - framework: CIS-GitHub-v1.2.0
    id: CIS-GitHub-v1.2.0
    url: https://www.cisecurity.org/benchmark/github
---

# Threat Model — Self-hosted runner risk

> Exemplar handcrafted 2026-04-26.

## Scenario

A platform engineer adopts self-hosted runners for the org's GitHub Actions workloads. Self-hosted runners are a known backdoor surface — Sysdig's November 2025 report on self-hosted-runner backdoors and Praetorian's TensorFlow analysis both demonstrate that long-lived runners with broad access become persistent C2 endpoints once compromised.

## Actors

- Platform Engineer (trusted, provisions and maintains the runner pool)
- Workflow Author (semi-trusted)
- Compromised Pull-Request Author (untrusted)
- Runner Image Maintainer (trusted; runner OS image is itself a supply-chain surface)

## Assets

- Self-hosted runner machine / container
- Runner registration token
- `ActionsRunnerGroup` configuration
- Filesystem state on the runner between jobs (if not ephemeral)
- Network access from the runner

## Threats (STRIDE)

| Type | Name | Description | Controls |
|---|---|---|---|
| T | Persistent backdoor on long-lived runner (Sysdig pattern) | PR-triggered workflow drops a backdoor; subsequent legitimate jobs run on the same runner where the backdoor exfils secrets. | CCM:DSI-01, NIST-SSDF-v1.1:PW.6, OpenSSF-Scorecard:Maintained, MITRE-ATTCK:T1195, GitHub-Well-Architected:PO.5 |
| I | Network exfil via runner with broad VPC access | A compromised job uses the runner's VPC access to scan / exfil internal services. | CCM:IVS-09, NIST-SSDF-v1.1:PO.5, GitHub-Well-Architected:PW.5 |
| E | Runner-group misconfiguration grants broader workflow access | `allowsPublic: true` lets fork PRs target a runner that should be private. | CCM:IAM-07, NIST-SSDF-v1.1:PO.3, GitHub-Well-Architected:PO.3, CIS-GitHub-v1.2.0 |
| S | Runner-registration-token leak → rogue runner joins the pool | Token leaked via Pulumi `Output` print; attacker registers rogue runner that picks up legitimate jobs. | CCM:IAM-10, NIST-SSDF-v1.1:PW.7, OpenSSF-Scorecard:Token-Permissions, MITRE-ATTCK:T1195 |

## Recommended Hulumi Components

- `@hulumi/baseline.github.OrgFoundation` — Shipped in Hulumi v1.1.0 M2. Provisions `ActionsRunnerGroup` resources with `allowsPublic: false` defaults at startup-hardened tier.
- `@hulumi/policies.github.HulumiGithubHardeningPack` — Shipped in Hulumi v1.1.0 M3. Declaratively rejects runner-group configurations that loosen the safe default.
- `@hulumi/drift.adapters.GithubWebhookFallbackAdapter` — Shipped in Hulumi v1.1.0 M4. Listens to `member` and `organization` webhook events to detect rogue-runner registrations.

## Open Questions

- **CIS-GitHub-v1.2.0** section numbers gated by WorkBench access; M3 lands resolved IDs.
- Ephemeral-runner-image hardening cookbook — defer to M5 documentation.
- Per the v1.1 deferral list, GHEC audit-log REST adapter would catch rogue-runner registration directly via `runner_group_runners.added` audit events.

---

_Exemplar handcrafted 2026-04-26. Audit footer: produced without embedding verbatim framework text._
