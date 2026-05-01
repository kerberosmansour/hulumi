# Hulumi for Kubernetes — AI-First Runbook v3

> **Purpose**: Open a Kubernetes / EKS / Istio / RDS / Secrets-Manager / build-time-credential surface in Hulumi, in five milestones, as committed in [`docs/slo/design/hulumi-k8s-surface.md`](../design/hulumi-k8s-surface.md). Hulumi v1.1 (AWS account-level + GitHub) is already shipped; this runbook is a feature-addition that ships a **new package** `@hulumi/k8s-baseline` alongside the existing three. The hard scope contract — **"Hulumi codifies security + stability defaults; cluster topology + workload shape stay in consumer hands"** — is pinned in the Global Execution Rules and is not negotiable per-milestone.
> **Audience**: AI coding agents first, humans second. Written to reduce ambiguity, prevent scope drift into cluster-topology / workload-shape territory, and ship Hulumi for K8s at the same trust posture as the AWS and GitHub variants.
> **How to use**: Work milestones sequentially. Before starting any milestone, read its full file under `docs/slo/runbook-milestones/hulumi-k8s-m{N}.md`, the Global Execution Rules, and the prior milestone's lessons file. After completing it, follow the Global Exit Rules. Never skip ahead. Never silently widen scope into cluster-topology decisions.
> **Prerequisite reading — Hulumi-for-K8s planning corpus**: The authoritative pre-implementation artifact is the design record at [`docs/slo/design/hulumi-k8s-surface.md`](../design/hulumi-k8s-surface.md) (`/slo-architect` was inlined into the design doc per the design's status note — Hulumi-for-K8s is a feature addition to an already-designed workspace, not a new product). The eight upstream issues that motivated the surface ([#38](https://github.com/kerberosmansour/hulumi/issues/38)–[#45](https://github.com/kerberosmansour/hulumi/issues/45)) are the field evidence; the design record is the synthesis. `/slo-tla` is N/A — no concurrent actors / distributed-state guarantees beyond Pulumi's standard apply ordering. Each milestone file under [`docs/slo/runbook-milestones/`](../runbook-milestones/) cites the relevant subset in its "Files to read before changing anything" row.

---

## Runbook Metadata

- **Runbook ID**: `hulumi-k8s-v1`
- **Prefix for test files and lessons files**: `hulumi-k8s`
- **Primary stack**: TypeScript 5.x on Node 20 LTS, pnpm workspaces, Pulumi CrossGuard v2+, Vitest, Apache-2.0 — same as existing AWS + GitHub Hulumi workspace; this runbook adds a NEW workspace package `@hulumi/k8s-baseline` (the first separate package since `@hulumi/drift`, per the design-record decision on package layout).
- **Primary surface added by this runbook**:
  - `@hulumi/k8s-baseline.HardenedHelmRelease` + `Args` + `Outputs` (lands in M1)
  - `@hulumi/k8s-baseline.EksSubnetTagger` + `Args` + `Outputs` (lands in M1)
  - `@hulumi/k8s-baseline.IstioFoundation` + `Args` + `Outputs` (lands in M2)
  - `@hulumi/k8s-baseline.AlbMeshedHttpEntrypoint` + `Args` + `Outputs` (lands in M3)
  - `@hulumi/k8s-baseline.KubernetesSecretFromAwsSecretsManager` + `Args` + `Outputs` (lands in M4)
  - `@hulumi/k8s-baseline.RdsCredentialSecret` + `Args` + `Outputs` (lands in M4, thin wrapper on the foundation above)
  - `@hulumi/k8s-baseline.GitHubAppCredential` + `Args` + `Outputs` (lands in M5)
  - User-facing executable scripts shipped in the package tarball: `populate-github-app-secret.sh` + `mint-github-app-token.sh` (lands in M5)
- **Default test commands** (additive to existing AWS + GitHub commands):
  - Unit (mocks, every PR): `pnpm -r test`
  - Integration (kind cluster, every PR): `pnpm --filter @hulumi/k8s-baseline test:integration:kind`
  - Real-EKS smoke (quarterly gate, manual): `HULUMI_INTEGRATION=1 HULUMI_EKS_SANDBOX_CLUSTER=<name> pnpm --filter @hulumi/k8s-baseline test:integration:eks`
  - Build: `pnpm -r build`
  - Lint / typecheck: `pnpm -r lint && pnpm -r typecheck`
  - License-boundary lint: `pnpm run lint:license-boundary` (existing — no new mappings in this runbook)
  - Exact-pin guard: `pnpm run lint:exact-pin-guard` (existing — extends to `@pulumi/kubernetes`, `@pulumi/eks`)
- **Allowed new dependencies by default**: `none` (per-milestone exceptions must be explicit in the Contract Block). Anticipated allow-listed exceptions: `@pulumi/kubernetes@4.x` (M1), `@pulumi/eks@3.x` (M1, optional peer used only by `EksSubnetTagger` typing), `@aws-sdk/client-secrets-manager@3.x` (M4 dynamic-provider runtime), `kind` test fixture binary (M1, dev-dep only).
- **Schema/config migration allowed by default**: `no`
- **Public interfaces from existing Hulumi v1.x that MUST remain stable** (the K8s work cannot break them):
  - All AWS surfaces from Hulumi v1.0.0: `AccountFoundation`, `SecureBucket`, `Tier`, `MonitoringFoundation`, `IdentityAlarms` (the AWS notifications surface most recently shipped).
  - All GitHub surfaces from Hulumi v1.1.0: `SecureRepository`, `OrgFoundation`, `OrgRulesets`, `OrgActions`, `OrgOidcTemplate`, `OrgSecurityDefaults`.
  - All policy and drift surfaces: `HulumiHardeningPack`, `CisV5Pack`, `HulumiGithubHardeningPack`, `CisGithubV1Pack`, `G_OIDC_1`, `DriftClassifier`, every `DriftAdapter`.
  - Tag keys `hulumi:iac-role`, `hulumi:tier`, `hulumi:component`, `hulumi:controls`, `hulumi:public-justification`.
  - Skill name `/hulumi-threat-model` and its 9 prebuilt scenarios; `SKILL.md` agentskills.io frontmatter.
- **Cross-package contract** (committed in design record § Decision: package layout):
  - `@hulumi/k8s-baseline` may import _types_ from `@hulumi/baseline` (e.g. `Tier`); never depends on it for runtime resources. This keeps consumers free to install one without the other.
  - Outputs that flow K8s → AWS travel via plain Pulumi `Output<string>`. No shared module state.

---

## Milestone Tracker

Update this table as each milestone is completed. This is the single source of truth for progress.

| #   | Milestone                                                                                                                      | Status | Started    | Completed  | Lessons File                                                | Completion Summary                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------- | ---------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | Package skeleton + `HardenedHelmRelease` + `EksSubnetTagger` (closes #38, cross-cutting #44, half-closes #42)                  | `done` | 2026-04-26 | 2026-04-26 | [docs/slo/lessons/hulumi-k8s-m1.md](../lessons/hulumi-k8s-m1.md) | [docs/slo/completion/hulumi-k8s-m1.md](../completion/hulumi-k8s-m1.md) |
| 2   | `IstioFoundation` (closes #39, full #42 close via the wrapper)                                                                 | `done` | 2026-04-26 | 2026-04-26 | [docs/slo/lessons/hulumi-k8s-m2.md](../lessons/hulumi-k8s-m2.md) | [docs/slo/completion/hulumi-k8s-m2.md](../completion/hulumi-k8s-m2.md) |
| 3   | `AlbMeshedHttpEntrypoint` (closes #41)                                                                                         | `done` | 2026-04-26 | 2026-04-26 | [docs/slo/lessons/hulumi-k8s-m3.md](../lessons/hulumi-k8s-m3.md) | [docs/slo/completion/hulumi-k8s-m3.md](../completion/hulumi-k8s-m3.md) |
| 4   | `KubernetesSecretFromAwsSecretsManager` + `RdsCredentialSecret` (closes #40)                                                   | `done` | 2026-04-26 | 2026-04-26 | [docs/slo/lessons/hulumi-k8s-m4.md](../lessons/hulumi-k8s-m4.md) | [docs/slo/completion/hulumi-k8s-m4.md](../completion/hulumi-k8s-m4.md) |
| 5   | `GitHubAppCredential` + shipped scripts + atomic four-package release of K8s package alongside the existing three (closes #43) | `done` | 2026-04-26 | 2026-04-26 | [docs/slo/lessons/hulumi-k8s-m5.md](../lessons/hulumi-k8s-m5.md) | [docs/slo/completion/hulumi-k8s-m5.md](../completion/hulumi-k8s-m5.md) |

<!-- Status values: not_started | in_progress | blocked | done -->

---

## End-to-End Architecture Diagram

Target end state after M5. Solid lines exist by end of v1; the K8s package is the new addition. Existing AWS + GitHub surfaces remain unchanged.

```mermaid
%%{init: {"flowchart": {"curve": "basis"}}}%%
flowchart TB
    subgraph User["User Environment (laptop or CI)"]
        Eng[Platform Engineer]
        CC[Claude Code]
        Git[(Local git repo with Pulumi program)]
        PulumiCLI[Pulumi CLI + Automation API]
        Baseline["@hulumi/baseline (v1.1.x — AWS account-level + GitHub)"]
        Policies["@hulumi/policies (v1.1.x — AWS + GitHub PolicyPack)"]
        Drift["@hulumi/drift (v1.1.x)"]
        K8sBaseline["@hulumi/k8s-baseline (v1.0.0 — NEW)"]
    end

    subgraph PulumiSide["Pulumi State Plane"]
        StateBackend[(State Backend — Pulumi Cloud or S3+DDB)]
    end

    subgraph EKS["Target EKS cluster (consumer-provisioned via @pulumi/eks)"]
        ClusterAPI["Cluster API server"]
        IstiodNs["istio-system Namespace (PSA baseline; istiod + ingressgateway)"]
        IstioCniNs["kube-system (istio-cni DaemonSet)"]
        AppNs["Application Namespaces (PSA baseline by default)"]
        ALB["AWS Load Balancer Controller (consumer-installed)"]
        IngressGw["Istio ingress gateway service (ClusterIP)"]
    end

    subgraph AwsSide["AWS Side"]
        IacRole["IaC Role tagged hulumi:iac-role=true"]
        VPC["VPC subnets (public + private)"]
        RdsSecret["RDS auto-managed master credential (Secrets Manager)"]
        AppSecret["3rd-party API credential (Secrets Manager)"]
        GhAppSecret["GitHub App credential (Secrets Manager)"]
        KMS["AccountFoundation KMS aliases"]
    end

    subgraph BuildPlane["Build / CI"]
        Buildkit["docker buildx + BuildKit secret-mount"]
        CargoFetch["cargo / npm / go / pip private fetch"]
    end

    subgraph Deferred["Out of scope at v1"]
        ClusterProv["Cluster provisioning (@pulumi/eks Cluster — consumer's)"]
        IRSA["IRSA helpers (use @pulumi/aws directly)"]
        OtherMesh["Linkerd / Cilium service mesh / App Mesh"]
        OtherIngress["NLB / Cloudflare Tunnel / NodePort / nginx-ingress"]
    end

    Eng -->|prompts| CC
    CC -->|writes Pulumi| Git
    Git -->|imports| Baseline
    Git -->|imports| Policies
    Git -->|imports| K8sBaseline

    Eng -->|pulumi up| PulumiCLI
    PulumiCLI -->|reads/writes| StateBackend
    PulumiCLI -->|HardenedHelmRelease + IstioFoundation| ClusterAPI
    ClusterAPI --> IstiodNs
    ClusterAPI --> IstioCniNs
    ClusterAPI --> AppNs

    PulumiCLI -->|EksSubnetTagger writes tags| VPC
    VPC -. ALB Controller auto-discovers .-> ALB
    ALB -->|target-type=ip → port 15021 health| IngressGw

    PulumiCLI -->|AlbMeshedHttpEntrypoint emits| ALB
    PulumiCLI -->|AlbMeshedHttpEntrypoint emits| IstiodNs
    PulumiCLI -->|AlbMeshedHttpEntrypoint emits| AppNs
    IngressGw --> AppNs

    PulumiCLI -->|KubernetesSecretFromAwsSecretsManager / RdsCredentialSecret| RdsSecret
    PulumiCLI -->|KubernetesSecretFromAwsSecretsManager| AppSecret
    RdsSecret -.->|extracted JSON keys| AppNs
    AppSecret -.->|extracted JSON keys| AppNs

    PulumiCLI -->|GitHubAppCredential creates SM container + IAM read| GhAppSecret
    GhAppSecret --> KMS
    Buildkit -. populate.sh once .-> GhAppSecret
    Buildkit -. mint.sh per-build .-> CargoFetch

    K8sBaseline -. uses Tier from .-> Baseline
    K8sBaseline -. peer dep .-> PulumiCLI

    classDef new fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    classDef exists fill:#fef3c7,stroke:#b45309,color:#78350f
    classDef persist fill:#dcfce7,stroke:#15803d,color:#14532d
    classDef actor fill:#fae8ff,stroke:#7e22ce,color:#581c87
    classDef oos fill:#fee2e2,stroke:#b91c1c,color:#7f1d1d

    class Eng actor
    class CC,PulumiCLI exists
    class Baseline,Policies,Drift exists
    class K8sBaseline,IstiodNs,IstioCniNs,AppNs,IngressGw new
    class ClusterAPI,ALB exists
    class IacRole,VPC,RdsSecret,AppSecret,GhAppSecret,KMS exists
    class Git,StateBackend persist
    class Buildkit,CargoFetch exists
    class ClusterProv,IRSA,OtherMesh,OtherIngress oos
```

### Component Summary Table

| Component                                                    | Milestone | Purpose                                                                                                                                                       |
| ------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@hulumi/k8s-baseline.HardenedHelmRelease`                   | M1        | Helm wrapper enforcing required `version`, required `repository`, instance-name release default, opt-in Fargate-exclusion affinity, chart-class-aware timeout |
| `@hulumi/k8s-baseline.EksSubnetTagger`                       | M1        | ALB-Controller-discovery tag writer for `kubernetes.io/role/elb`, `kubernetes.io/role/internal-elb`, `kubernetes.io/cluster/<name>`                           |
| `@hulumi/k8s-baseline.IstioFoundation`                       | M2        | Bundles istiod (`pilot.cni.enabled=true`) + istio-cni DaemonSet + istio-ingressgateway, version-pinned together, PSA-baseline-clean                           |
| `@hulumi/k8s-baseline.AlbMeshedHttpEntrypoint`               | M3        | Emits ALB Ingress + Istio `Gateway` + `VirtualService` + `AuthorizationPolicy` for one workload, with consistent SA-principal linkage                         |
| `@hulumi/k8s-baseline.KubernetesSecretFromAwsSecretsManager` | M4        | Generic foundation: extracts a JSON Secrets-Manager value into a K8s `Secret` via dynamic provider                                                            |
| `@hulumi/k8s-baseline.RdsCredentialSecret`                   | M4        | Convenience wrapper on the foundation, shaped for AWS RDS auto-managed master credential JSON (`username`, `password`, `host`, …)                             |
| `@hulumi/k8s-baseline.GitHubAppCredential`                   | M5        | Provisions a Secrets Manager container + IAM read policy for a GitHub App's app_id + private key; ships `populate.sh` + `mint.sh`                             |

### Data Flow Summary

1. **Authoring (design-time)**: Engineer → Claude Code → imports `@hulumi/k8s-baseline.IstioFoundation` + `AlbMeshedHttpEntrypoint` + `RdsCredentialSecret` + `GitHubAppCredential` alongside their existing `@hulumi/baseline.aws.*` and `@hulumi/baseline.github.*` calls.
2. **Plan/apply (deploy-time)**: `pulumi up` → `HardenedHelmRelease` enforces required version + required repository + stable name → Helm releases for istiod / cni / gateway converge in dependency order → `EksSubnetTagger` writes ALB-discovery tags → `KubernetesSecretFromAwsSecretsManager` dynamic provider extracts JSON keys → `AlbMeshedHttpEntrypoint` emits the four-resource bundle.
3. **Build (CI-time, M5)**: `mint.sh` reads the GitHub App secret from Secrets Manager (via IAM read policy attached to BuildKit's IAM principal) → emits a 1-hour installation token → BuildKit secret-mount feeds it into `cargo fetch` / `npm install` / etc.
4. **Release (v1.2.0 atomic four-package)**: tag → existing GitHub Actions + SLSA reusable workflow → four npm packages re-released with provenance + GitHub release with SBOMs covering the new K8s surface.

---

## High-Level Design for Formal Verification (TLA+ Section)

**TLA+ status: N/A for this runbook.**

Reasoning: No concurrent actors / distributed-state guarantees beyond Pulumi's standard apply ordering. Each component declares its dependencies explicitly via `dependsOn`; Pulumi serializes resource creation by topology. The `KubernetesSecretFromAwsSecretsManager` dynamic provider runs at apply time within Pulumi's single-threaded engine — no concurrent extraction races. The Istio install order (cni Ready before istiod renders the injector ConfigMap) is enforced by `dependsOn`, not by quorum or consensus.

If a future change introduces concurrent actors (e.g., a webhook-driven runtime credential rotator that races with `pulumi up`), `/slo-tla` re-verification becomes required and is flagged in that change's design rule. The existing `HulumiDrift.tla` continues to govern the AWS drift adapter quorum unaffected.

---

## Global Execution Rules

### 0) The Hulumi-K8s scope contract — pinned at the top, not negotiable per-milestone

**Hulumi K8s components codify _security_ + _stability_ defaults that have right answers; cluster topology + workload shape stay in consumer hands.** This runbook is in scope for components where (a) the right-default value is non-obvious, (b) every consumer re-derives the same fragile glue today, and (c) a packaged abstraction collapses ≥3 hand-written resources into one declaration. It is **out of scope** for cluster provisioning, node-group / Karpenter / Fargate-profile shape, CNI plugin choice, application-level network policies, IRSA / SA → IAM-role binding helpers, and any mesh / ingress alternative beyond the v1 commitments (Istio + ALB).

**In scope** (per the design record):

- Helm release wrapping with hardened defaults (`HardenedHelmRelease`).
- EKS subnet tagging for ALB Controller auto-discovery (`EksSubnetTagger`).
- Service mesh foundation (Istio v1, see § Decision: mesh choice in the design record).
- Bundled mesh HTTP entrypoints (ALB + Istio `Gateway` + `VirtualService` + `AuthorizationPolicy`).
- Database-credential extraction from AWS Secrets Manager into K8s `Secret` (generic foundation + `RdsCredentialSecret` convenience).
- Build-time credential bundles for GitHub App-issued installation tokens (`GitHubAppCredential` + shipped scripts).

**Out of scope** (per the design record):

- Cluster provisioning. Use `@pulumi/eks` `Cluster` directly.
- Node-group / Karpenter / Fargate-profile shape.
- CNI plugin choice (AWS VPC CNI / Cilium / Calico / Weave). Hulumi K8s components install on top of whatever's there.
- Workload sidecars beyond Istio (OTEL collectors, log agents). Application-specific.
- Application-level network policies. Workload-specific.
- IRSA / SA → IAM-role binding helpers.
- Mesh alternatives (Linkerd, Cilium service mesh, App Mesh, Consul). Istio only at v1.
- Ingress alternatives (NLB, Cloudflare Tunnel, NodePort, nginx-ingress, traefik). ALB only at v1.
- Database engines beyond RDS / Aurora / DocumentDB / Neptune (which all share the auto-managed-master JSON shape covered by `RdsCredentialSecret`).
- Build-time credential flows beyond GitHub Apps. Demand-driven.

A PR that adds a `@pulumi/eks` `Cluster` wrapper, a Karpenter helper, an IRSA component, or a Linkerd / NLB / `aws-nginx-ingress` parallel surface is **rejected at review** and the rejection cites this rule + the design record.

### 1) Stay inside scope

Every change must fall inside the current milestone's Contract Block file allow-list. Changes to existing AWS / GitHub Hulumi v1.x files outside the explicit allow-list are forbidden — those interfaces are stable.

### 2) Tests define the contract

Write BDD scenarios first; make them fail for the expected reason; implement to pass. No production-path change without a matching test. K8s-side tests run against the in-process Pulumi mock-runtime; integration tests run against [kind](https://kind.sigs.k8s.io/) by default with a quarterly real-EKS gate (per design-record open question Q1).

### 3) No placeholders in production paths

No `TODO`, no `// will fix later`, no `throw new Error("not implemented")` in shipped code. Forward-references in docs say "available in Hulumi vN+" with an explicit version.

### 4) Preserve backwards compatibility

Interfaces listed in Runbook Metadata are stable. Existing AWS + GitHub interfaces from Hulumi v1.x cannot be broken — extending `Tier` is allowed only via additive changes. The K8s package's first published version is `v1.0.0`; once published, its public interfaces are stable through any v1.x release.

### 5) Prefer smallest safe change

A bug fix doesn't need surrounding cleanup. A one-shot operation doesn't need a helper. Three similar lines is better than a premature abstraction.

### 6) Record evidence, not claims

Every milestone fills the Evidence Log with actual command outputs, not "all tests pass ✓". `/slo-retro` refuses to close a milestone with blank Actual Result cells.

### 7) Keep .gitignore current and clean up test artifacts

Pulumi checkpoints, kind cluster state, integration-test sandbox-EKS state, Helm chart caches — all must be ignored. `git status` after a milestone must be clean.

### 8) Version pinning is non-negotiable

Every Hulumi K8s component that takes a `version` arg requires it. No `latest`, no fallback, no implicit "Hulumi picks for you." Hulumi maintains a tested-versions table in `packages/k8s-baseline/COMPATIBILITY.md` + a typed TS const (per design record open question Q3 → bias accepted: typed TS const). The component emits a `pulumi.log.warn` (not error) when the consumer pins to a version Hulumi has not tested — the consumer accepts the risk.

### 9) PSA-baseline is the security default

Every namespace Hulumi K8s components create defaults to `pod-security.kubernetes.io/enforce: baseline`. Override via explicit `podSecurity: "privileged" | "restricted"` arg on namespace-creating components. `restricted` is supported but not the default.

---

## Global Entry Rules (Pre-Milestone Protocol)

1. Read the full milestone file under `docs/slo/runbook-milestones/hulumi-k8s-m<N>.md` + Global Execution Rules (especially Rule 0).
2. Read prior-milestone lessons (`docs/slo/lessons/hulumi-k8s-m<N-1>.md`).
3. Read the design record [`docs/slo/design/hulumi-k8s-surface.md`](../design/hulumi-k8s-surface.md) — every component's API shape and rationale lives there; the runbook only sequences and tests.
4. Read files listed in "Files to read before changing anything."
5. Copy the Evidence Log template into the milestone's Evidence Log section.
6. Re-state the milestone's load-bearing constraints in your own words in working notes before coding, **including the Rule 0 scope contract.**

## Global Exit Rules (Post-Milestone Protocol)

1. All BDD + E2E tests green.
2. Smoke tests checked off.
3. Compatibility checklist complete (incl. AWS + GitHub Hulumi v1.x interfaces unbroken).
4. `git status` clean.
5. `.gitignore` updated.
6. `docs/slo/lessons/hulumi-k8s-m<N>.md` written with surprises + decisions + deltas-from-plan.
7. `docs/slo/completion/hulumi-k8s-m<N>.md` written with changed files + tests added + documentation updated.
8. Milestone Tracker above updated to `done`.
9. Docs listed in Post-Flight updated.

---

## Background Context

### Current State

Hulumi v1.0.0 (AWS) + v1.1.0 (GitHub) are shipped and stable. Master runbooks at [`docs/slo/completed/RUNBOOK-hulumi.md`](./RUNBOOK-hulumi.md) and [`docs/slo/completed/RUNBOOK-hulumi-github.md`](./RUNBOOK-hulumi-github.md), all milestones `done`. The AWS account-level surface includes `MonitoringFoundation` and `IdentityAlarms` (the most recent additions). No K8s / Istio / EKS / RDS / Secrets-Manager wrapper surface exists yet — consumers re-derive the patterns by hand on every deployment.

### Problem

A consumer running production workloads on EKS with Istio + ALB + RDS + private-GitHub-dep CI re-derives at least eight separate fragile patterns by hand: Helm release naming, DaemonSet Fargate exclusion, ALB-Controller subnet tagging, PSA-baseline-clean Istio install (the `pilot.cni.enabled=true` step alone is a documented ~90 minute error), bundled meshed HTTP entrypoints, RDS-managed credential extraction to a K8s Secret, GitHub App installation-token mint scripts, and the cross-cutting decisions that connect all of the above. These are not consumer-specific — every team running EKS + Istio + ALB + RDS hits all eight. The cost of abstraction pays back because every consumer is rebuilding the same glue and getting it subtly wrong; issues #38–#45 are the field evidence.

### Target Architecture

See the End-to-End Architecture Diagram above. The detailed component-by-component design is committed in [`docs/slo/design/hulumi-k8s-surface.md`](../design/hulumi-k8s-surface.md) — every "Decision" line in that doc is a commitment-point this runbook delivers against.

### Key Design Principles

Inherits all principles from the AWS + GitHub Hulumi runbooks, plus four K8s-specific additions (committed in the design record):

- **PSA-baseline by default.** Every Hulumi-created namespace enforces `pod-security.kubernetes.io/enforce: baseline`. Override via explicit `podSecurity` arg.
- **Version pinning is required, not optional.** Every component taking a `version` arg requires it. Untested versions emit a warning, not an error.
- **Helm release names are stable.** `HardenedHelmRelease.releaseName` defaults to the ComponentResource instance name; the Pulumi default of "always add a random suffix" is wrong for IaC reproducibility.
- **Scope discipline: security + stability defaults, not cluster topology.** Cluster shape (provisioning, node groups, CNI plugin, IRSA wiring, ingress alternatives, mesh alternatives, additional database engines) stays in consumer hands.

### What to Keep

The entire shipped AWS Hulumi v1.0.0 + GitHub Hulumi v1.1.0 surface. No regressions allowed.

### What to Change

Nothing in the AWS or GitHub surfaces. All changes are additive in a NEW workspace package `@hulumi/k8s-baseline`.

### Global Red Lines

Inherits from the AWS + GitHub runbooks, plus eight K8s-specific additions:

- **No `@pulumi/eks` `Cluster` wrapper.** Cluster provisioning stays consumer-side; we operate on the cluster the consumer hands us.
- **No CNI plugin shipped or assumed.** Hulumi K8s components must work on top of AWS VPC CNI, Cilium, Calico, or Weave with no code changes.
- **No mesh alternative shipped.** Istio v1 only. Linkerd / Cilium service mesh / App Mesh / Consul Connect are out of scope.
- **No ingress alternative shipped.** ALB v1 only. NLB / Cloudflare Tunnel / NodePort / nginx-ingress / traefik are out of scope.
- **No `latest` chart version anywhere.** Every Helm release pins exact (`1.24.2`), not floating (`^1.24.2` is also forbidden — Helm chart pinning is exact, not semver).
- **No raw `helm.v3.Release` in shipped Hulumi code paths.** Every chart goes through `HardenedHelmRelease`. Tests + integration fixtures may use `helm.v3.Release` directly to assert the wrapper's behavior, not as production code.
- **No `child_process.exec` in dynamic-provider code.** The `KubernetesSecretFromAwsSecretsManager` dynamic provider uses `@aws-sdk/client-secrets-manager` SDK; no shell-out paths.
- **No GitHub App private keys or installation tokens in repo state.** `GitHubAppCredential` provisions the Secrets Manager container; the consumer populates it out-of-band via `populate.sh`. Tests skip when the secret is unpopulated.

---

## BDD and Runtime Validation Rules

(Inherits from `docs/slo/completed/RUNBOOK-hulumi.md` § BDD and Runtime Validation Rules. The K8s-specific test-file naming is:)

- Unit / BDD: `packages/k8s-baseline/tests/<feature>.test.ts`
- Integration (kind cluster, every PR): `packages/k8s-baseline/tests/integration/kind/<feature>.kind.test.ts`
- Integration (real EKS, quarterly): `packages/k8s-baseline/tests/integration/eks/<feature>.eks.test.ts`

### Test-Artifact Cleanup Rules — K8s-specific

- Kind clusters: each integration test creates a uniquely-named kind cluster `hulumi-k8s-m<N>-<test-id>`; `afterAll` runs `kind delete cluster --name <name>`; teardown survives partial test failure (logs but continues). Cluster names appear in `.gitignore` patterns to catch leaked checkpoints.
- Real-EKS: each test creates resources (Helm releases, K8s Secrets) tagged `hulumi-k8s-m<N>-<test-id>`; `afterAll` `kubectl delete` by label-selector; teardown survives partial failure.
- Helm chart caches: `~/.cache/helm/repository/` entries created by tests live under the test's tempdir, not the user's home cache.

---

## Documentation Update Table

Tracks which documentation files each milestone touches. Maintainers update this table as part of each milestone's Post-Flight step.

| Doc / Surface                                     | M1                                               | M2                       | M3                  | M4                                             | M5                                                                               |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------ | ------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| `README.md`                                       | —                                                | —                        | —                   | —                                              | UPDATE — K8s variant section, install path                                       |
| `AGENTS.md`                                       | —                                                | —                        | —                   | —                                              | UPDATE — pointer to `RUNBOOK-hulumi-k8s.md`                                      |
| `docs/why-hulumi.md`                              | —                                                | —                        | —                   | —                                              | UPDATE — paragraph on K8s variant + scope contract                               |
| `docs/getting-started.md`                         | —                                                | —                        | —                   | —                                              | UPDATE — "K8s variant" section                                                   |
| `docs/slo/completed/RUNBOOK-hulumi-k8s.md` Milestone Tracker    | UPDATE                                           | UPDATE                   | UPDATE              | UPDATE                                         | UPDATE                                                                           |
| `docs/slo/completed/RUNBOOK-hulumi-k8s.md` Doc Update Table     | —                                                | —                        | —                   | —                                              | UPDATE — final fill-in                                                           |
| `docs/slo/runbook-milestones/hulumi-k8s-m1.md`        | NEW                                              | —                        | —                   | —                                              | —                                                                                |
| `docs/slo/runbook-milestones/hulumi-k8s-m2.md`        | —                                                | NEW                      | —                   | —                                              | —                                                                                |
| `docs/slo/runbook-milestones/hulumi-k8s-m3.md`        | —                                                | —                        | NEW                 | —                                              | —                                                                                |
| `docs/slo/runbook-milestones/hulumi-k8s-m4.md`        | —                                                | —                        | —                   | NEW                                            | —                                                                                |
| `docs/slo/runbook-milestones/hulumi-k8s-m5.md`        | —                                                | —                        | —                   | —                                              | NEW                                                                              |
| `docs/slo/lessons/hulumi-k8s-m1..m5.md`               | NEW (m1)                                         | NEW (m2)                 | NEW (m3)            | NEW (m4)                                       | NEW (m5)                                                                         |
| `docs/slo/completion/hulumi-k8s-m1..m5.md`            | NEW (m1)                                         | NEW (m2)                 | NEW (m3)            | NEW (m4)                                       | NEW (m5)                                                                         |
| `docs/cookbooks/README.md`                        | —                                                | —                        | —                   | —                                              | UPDATE — three new cookbooks indexed                                             |
| `docs/cookbooks/psa-baseline-istio-sidecar.md`    | —                                                | —                        | —                   | —                                              | UPDATE — replace hand-rolled Pulumi snippets with `IstioFoundation`              |
| `docs/cookbooks/k8s-helm-release-rename.md`       | —                                                | —                        | —                   | —                                              | NEW — migration cookbook for adopting `HardenedHelmRelease` on suffixed releases |
| `docs/cookbooks/eks-meshed-workload-bootstrap.md` | —                                                | —                        | —                   | —                                              | NEW — full M2+M3+M4 bootstrap cookbook for a single workload                     |
| `docs/cookbooks/github-app-private-deps-build.md` | —                                                | —                        | —                   | —                                              | NEW — build-time-credential cookbook                                             |
| `docs/components/README.md`                       | —                                                | —                        | —                   | —                                              | UPDATE                                                                           |
| `docs/components/hardened-helm-release.md`        | NEW (one-line stub)                              | UPDATE                   | —                   | —                                              | UPDATE — full reference                                                          |
| `docs/components/eks-subnet-tagger.md`            | NEW (one-line stub)                              | —                        | —                   | —                                              | UPDATE — full reference                                                          |
| `docs/components/istio-foundation.md`             | —                                                | NEW (one-line stub)      | —                   | —                                              | UPDATE — full reference                                                          |
| `docs/components/alb-meshed-http-entrypoint.md`   | —                                                | —                        | NEW (one-line stub) | —                                              | UPDATE — full reference                                                          |
| `docs/components/kubernetes-secret-from-asm.md`   | —                                                | —                        | —                   | NEW (one-line stub)                            | UPDATE — full reference                                                          |
| `docs/components/rds-credential-secret.md`        | —                                                | —                        | —                   | NEW (one-line stub)                            | UPDATE — full reference                                                          |
| `docs/components/github-app-credential.md`        | —                                                | —                        | —                   | —                                              | NEW (one-line stub) + UPDATE — full reference                                    |
| `examples/k8s-helm-smoke/`                        | —                                                | —                        | —                   | —                                              | NEW                                                                              |
| `examples/k8s-mesh-bootstrap-smoke/`              | —                                                | —                        | —                   | —                                              | NEW                                                                              |
| `packages/k8s-baseline/COMPATIBILITY.md`          | NEW                                              | UPDATE                   | UPDATE              | UPDATE                                         | UPDATE                                                                           |
| `packages/k8s-baseline/package.json`              | NEW                                              | —                        | —                   | —                                              | UPDATE — version bump for first publish                                          |
| `pnpm-workspace.yaml`                             | UPDATE — add `packages/*` if not already covered | —                        | —                   | —                                              | —                                                                                |
| `CHANGELOG.md`                                    | —                                                | —                        | —                   | —                                              | UPDATE — v1.2.0 entry                                                            |
| `docs/issue-candidates.md`                        | UPDATE — strike #38, #44                         | UPDATE — strike #39, #42 | UPDATE — strike #41 | UPDATE — strike #40                            | UPDATE — strike #43, sync with v1.2 release                                      |
| `docs/ARCHITECTURE.md`                            | UPDATE — describe M1 additions                   | UPDATE — M2              | UPDATE — M3         | UPDATE — M4                                    | UPDATE — M5 launch state                                                         |
| `.github/workflows/weekly-integration.yml`        | UPDATE — kind matrix entry                       | —                        | —                   | —                                              | UPDATE — extend matrix                                                           |
| `.github/workflows/release.yml`                   | —                                                | —                        | —                   | —                                              | UPDATE — atomic four-package release                                             |
| `scripts/exact-pin-guard.mjs`                     | UPDATE — add `@pulumi/kubernetes`, `@pulumi/eks` | —                        | —                   | UPDATE — add `@aws-sdk/client-secrets-manager` | —                                                                                |
| `scripts/cooling-off-diff.mjs`                    | UPDATE — add `@pulumi/kubernetes`, `@pulumi/eks` | —                        | —                   | UPDATE — add `@aws-sdk/client-secrets-manager` | —                                                                                |

---

## Per-Milestone Specs

Each milestone has its own file under [`docs/slo/runbook-milestones/`](../runbook-milestones/):

- [M1: package skeleton + `HardenedHelmRelease` + `EksSubnetTagger`](../runbook-milestones/hulumi-k8s-m1.md)
- [M2: `IstioFoundation`](../runbook-milestones/hulumi-k8s-m2.md)
- [M3: `AlbMeshedHttpEntrypoint`](../runbook-milestones/hulumi-k8s-m3.md)
- [M4: `KubernetesSecretFromAwsSecretsManager` + `RdsCredentialSecret`](../runbook-milestones/hulumi-k8s-m4.md)
- [M5: `GitHubAppCredential` + shipped scripts + atomic four-package release](../runbook-milestones/hulumi-k8s-m5.md)

Lessons learned: `docs/slo/lessons/hulumi-k8s-m{1..5}.md` — written during each milestone's exit. Completion summaries: `docs/slo/completion/hulumi-k8s-m{1..5}.md` — written during each milestone's exit.

---

## Recommended next step

Before any implementation begins, run **`/slo-critique hulumi-k8s`** to walk the four-persona adversarial review (CEO, eng-lead, security; design pass auto-skipped — no UI surface). Critique will find what this plan got wrong before code lands. Then `/slo-execute M1` to begin shipping the package skeleton + `HardenedHelmRelease` + `EksSubnetTagger`.
