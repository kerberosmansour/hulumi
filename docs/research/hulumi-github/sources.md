# Sources — Hulumi for GitHub research

All URLs retrieved 2026-04-25 / 2026-04-26 by `sldo-research` over 4 iterations / 14 web searches. Grouped by topic for cross-reference from `dossier.md`, `synthesis.md`, and `raw.md`.

## Pulumi GitHub provider (Q1)

- <https://www.pulumi.com/registry/packages/github/> — Github Provider | Pulumi Registry
- <https://www.pulumi.com/registry/packages/github/api-docs/provider/> — `github.Provider` (auth schema: `token` + `appAuth`)
- <https://www.pulumi.com/registry/packages/github/installation-configuration/> — Installation & Configuration
- <https://www.pulumi.com/registry/packages/github/api-docs/repository/> — `github.Repository`
- <https://www.pulumi.com/registry/packages/github/api-docs/repositoryruleset/> — `github.RepositoryRuleset` (incl. `requiredCodeScanning`, `requiredCodeScanningTools`, alert/severity thresholds)
- <https://www.pulumi.com/registry/packages/github/api-docs/organizationruleset/> — `github.OrganizationRuleset`
- <https://www.pulumi.com/registry/packages/github/api-docs/organizationsettings/> — `github.OrganizationSettings` (org-level security defaults at all tiers)
- <https://www.pulumi.com/registry/packages/github/api-docs/actionsorganizationoidcsubjectclaimcustomizationtemplate/> — OIDC sub-claim template
- <https://www.pulumi.com/registry/packages/github/api-docs/enterprisesecurityanalysissettings/> — `github.EnterpriseSecurityAnalysisSettings` (validity-checks, custom-link)
- <https://github.com/pulumi/pulumi-github> — `pulumi/pulumi-github` source
- <https://github.com/pulumi/pulumi-github/releases> — Releases (v6.13.0 dated 2026-04-24; v6.12.2 dated 2026-04-10)
- <https://github.com/pulumi/registry> — `pulumi/registry`
- <https://www.pulumi.com/docs/version-control/github-app/> — Pulumi GitHub App (VCS integration; distinct from provider auth)
- <https://www.pulumi.com/docs/integrations/version-control/> — Pulumi Version Control Integrations
- <https://www.pulumi.com/docs/iac/guides/continuous-delivery/github-actions/> — Using Pulumi GitHub Actions

## GitHub REST + audit log + webhooks (Q1, Q4)

- <https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-admin/audit-log> — Enterprise audit log REST endpoints (GHEC; classic-PAT-only with `read:audit_log`)
- <https://docs.github.com/en/enterprise-cloud@latest/rest/enterprise-admin/audit-log?apiVersion=2026-03-10> — Versioned audit log API (`apiVersion=2026-03-10`)
- <https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/using-the-audit-log-api-for-your-enterprise> — Retention 180d non-Git / 7d Git
- <https://docs.github.com/en/enterprise-cloud@latest/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/streaming-the-audit-log-for-your-enterprise> — Streaming destinations: S3, Azure Blob, Azure Event Hubs, Datadog, GCS, Splunk
- <https://docs.github.com/en/enterprise-server@3.14/admin/monitoring-activity-in-your-enterprise/reviewing-audit-logs-for-your-enterprise/streaming-the-audit-log-for-your-enterprise> — GHES 3.14 streaming
- <https://docs.github.com/en/enterprise-cloud@latest/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/reviewing-the-audit-log-for-your-organization> — GHEC org-level audit log API
- <https://docs.github.com/en/webhooks/webhook-events-and-payloads> — Webhook events catalog (push-model fallback)
- <https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository> — Configuration plane
- <https://docs.github.com/en/code-security/getting-started/quickstart-for-securing-your-repository> — Workflow plane
- <https://docs.github.com/en/code-security/getting-started/github-security-features> — GitHub security features overview
- <https://docs.github.com/en/actions/reference/security/secure-use> — Actions secure-use reference (OIDC, SHA pinning)
- <https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect> — Security hardening with OIDC (`job_workflow_ref` / `environment` / `ref` guidance)

## Cloud OIDC trust documentation (Q1, Q3, threat scenario d)

- <https://docs.aws.amazon.com/IAM/latest/UserGuide/id_jwt_creating_oidc_provider_github.html> — AWS — Creating OIDC IdP for GitHub
- <https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust> — Azure — Workload identity federation create trust
- <https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines> — GCP — Workload identity federation with deployment pipelines

## Frameworks and standards (Q3, Q5)

- <https://wellarchitected.github.com/library/scenarios/nist-ssdf-implementation/> — NIST SSDF on GitHub (Well-Architected mapping; the cleanest infra-vs-workflow split)
- <https://csrc.nist.gov/pubs/sp/800/218/final> — NIST SP 800-218 v1.1 (final 2022-02-03)
- <https://csrc.nist.gov/Projects/ssdf> — NIST SSDF project page
- <https://csrc.nist.gov/News/2025/draft-ssdf-version-1-2> — Draft SSDF v1.2 IPD (2025-12-17)
- <https://csrc.nist.gov/publications/sp> — NIST CSRC publications index
- <https://slsa.dev/spec/v1.2/source-requirements> — SLSA v1.2 source-track requirements
- <https://scorecard.dev/> — OpenSSF Scorecard
- <https://attack.mitre.org/techniques/T1195/> — MITRE ATT&CK T1195 (Supply Chain Compromise)

## CIS license / posture (Q3, Q5, Q7)

- <https://www.cisecurity.org/cis-benchmarks> — CIS Benchmarks index
- <https://www.cisecurity.org/terms-of-use-for-non-member-cis-products> — CIS Terms of Use for Non-Member CIS Products
- <https://www.cisecurity.org/insights/blog/cis-benchmarks-march-2026-update> — CIS Benchmarks March 2026 Update (announces v1.2.0 cohort)
- <https://learn.microsoft.com/en-us/compliance/regulatory/offering-cis-benchmark> — Microsoft Learn — CIS Benchmark offering

## Competitor primary sources (Q2)

- <https://github.com/ossf/allstar> — `ossf/allstar` v4.5 (2025-10-01, Apache-2.0, 724 commits)
- <https://openssf.org/blog/2021/08/11/introducing-the-allstar-github-app/> — Introducing the Allstar GitHub App
- <https://therecord.media/google-open-sources-allstar-a-tool-to-protect-github-repos> — Google open-sources Allstar
- <https://github.com/github/safe-settings> — `github/safe-settings` 2.1.20-rc.3 (2026-03-31, ISC, 1,202 commits on `main-enterprise`)
- <https://github.com/github/safe-settings/discussions/644> — `github/safe-settings` Discussion #644
- <https://probot.github.io/apps/settings/> — Settings app (Probot)
- <https://probot.github.io/docs/> — Probot Documentation
- <https://github.com/step-security/secure-repo> — `step-security/secure-repo` v1.12.0 (2026-04-17, **AGPL-3.0**, 1,408 commits, 32 releases)
- <https://www.stepsecurity.io/> — StepSecurity vendor site
- <https://www.stepsecurity.io/github-actions-and-stepsecurity> — StepSecurity GitHub Actions Security
- <https://app.stepsecurity.io/> — StepSecurity App
- <https://app.stepsecurity.io/action-advisor/octo-sts/action> — StepSecurity Action Advisor — octo-sts
- <https://github.com/step-security> — StepSecurity org
- <https://github.com/octo-sts/app> — `octo-sts/app` (Chainguard; canonical URL migrated from `chainguard-dev/octo-sts`)
- <https://github.com/octo-sts/app/releases> — `octo-sts/app` releases
- <https://github.com/octo-sts> — Octo STS org
- <https://edu.chainguard.dev/open-source/octo-sts/faq/> — Octo STS FAQ — Chainguard Academy
- <https://github.com/philips-labs> — `philips-labs` org (the `philips-labs/terraform-github-repository` cited in the brief does not exist; conflated with `philips-labs/terraform-aws-github-runner` archived 2025-01-16)
- <https://wicksipedia.com/blog/github-settings-as-code/> — GitHub Repository Settings as Code (third-party blog)

## Incident / threat-model evidence (Q5)

- <https://www.wiz.io/blog/github-actions-security-guide> — Wiz — Hardening GitHub Actions
- <https://www.wiz.io/blog/six-accounts-one-actor-inside-the-prt-scan-supply-chain-campaign> — Wiz — prt-scan supply chain campaign
- <https://openssf.org/blog/2025/06/11/maintainers-guide-securing-ci-cd-pipelines-after-the-tj-actions-and-reviewdog-supply-chain-attacks/> — OpenSSF — Maintainers' guide after tj-actions/reviewdog
- <https://snyk.io/articles/trivy-github-actions-supply-chain-compromise/> — Snyk — Trivy GitHub Actions supply-chain compromise
- <https://www.sysdig.com/blog/how-threat-actors-are-using-self-hosted-github-actions-runners-as-backdoors> — Sysdig — Self-hosted GitHub Actions runners as backdoors
- <https://labs.cloudsecurityalliance.org/research/briefing-csa-research-note-oidc-trust-chain-abuse-cloud-take/> — CSA Labs — OIDC trust chain abuse cloud takeover
- <https://unit42.paloaltonetworks.com/oidc-misconfigurations-in-ci-cd/> — Unit 42 — OH-MY-DC: OIDC misconfigurations in CI/CD
- <https://thehackernews.com/2026/03/openai-patches-chatgpt-data.html> — The Hacker News — OpenAI Codex token-stealing patch
- <https://github.com/security/advanced-security> — GitHub Advanced Security overview

## GitHub platform changelog (proxy-roadmap signal, Q4)

- <https://github.blog/changelog/> — GitHub Changelog (filter by Actions / Audit log / Security)
- <https://github.blog/news-insights/product-news/whats-coming-to-our-github-actions-2026-security-roadmap/> — 2026 Actions security roadmap
- <https://github.blog/changelog/2025-08-15-github-actions-policy-now-supports-blocking-and-sha-pinning-actions/> — Actions org policy SHA-pin GA (2025-08-15)
- <https://github.blog/changelog/2025-01-13-audit-log-streaming-of-api-requests-is-generally-available/> — Audit-log streaming of API requests GA (2025-01-13)
- <https://github.blog/changelog/2023-02-01-api-requests-are-available-via-audit-log-streaming-private-beta/> — API-requests audit-log streaming private beta (2023-02-01)
- <https://github.blog/changelog/2023-04-03-api-requests-are-available-via-audit-log-streaming-public-beta/> — API-requests audit-log streaming public beta (2023-04-03)
- <https://github.blog/security/supply-chain-security/securing-the-open-source-supply-chain-across-github/> — Securing the open source supply chain across GitHub

## Adjacent / corroborative

- <https://github.com/M-Davies/cis-github-benchmark> — Self-described "doesn't seem to exist yet"; demand-signal repo
- <https://github.com/dev-sec/cis-dil-benchmark> — InSpec profile (different CIS benchmark; reference shape)
- <https://github.com/dev-sec/cis-docker-benchmark> — InSpec profile (different CIS benchmark; reference shape)
- <https://github.com/dev-sec/cis-kubernetes-benchmark> — InSpec profile (different CIS benchmark; reference shape)
- <https://github.com/mitre/cis-bench> — CIS WorkBench CLI (no help on GitHub Benchmark IDs)
- <https://blocksentient.com/review/github-enterprise/> — BlockSentient — GitHub Enterprise 2026 review (pricing proxy)
- <https://socfortress.medium.com/secure-use-of-github-cis-aligned-technical-guide-part-vii-c3f03db9205e> — SOCFortress — Secure Use of GitHub CIS-aligned Part VII (third-party blog)
