# MITRE ATLAS contribution plan (post-release stub)

Hulumi cites MITRE ATLAS v5.1 technique IDs (e.g. `AML.T0001`)
in the threat-model skill output and in the SecureBucket /
AccountFoundation `hulumi:controls` tag CSV. MITRE ATLAS is a
working knowledge base of adversarial machine-learning tactics;
we want to contribute Hulumi's threat-model scenarios + drift
classifier evidence as documented techniques + mitigations.

This document is a **stub** — the real contribution is a
multi-week post-release task, not part of M5's deliverables.

## Target contributions

1. **Mitigation: Hardened-default IaC components.** Document the
   tier-matrix pattern (Sandbox / Startup-Hardened) and the
   SCP-paired tag protection as a mitigation against
   ML-supply-chain attacks where a poisoned LLM emits raw
   `aws.s3.Bucket` resources without security controls.

2. **Detection: TLA+-verified drift classifier.** Document the
   4-adapter classification approach + TLA+ trace as a detection
   technique against console-break-glass-after-IaC-deploy
   attacks.

3. **Use-case: Hulumi threat-model skill.** Document the
   `/hulumi-threat-model` Claude Code skill's scenario set as
   a template that other ML-IaC integrations could fork.

## Process

1. Email <atlas@mitre.org> for contributor onboarding.
2. Submit drafts via the documented MITRE ATLAS contribution
   workflow (PR-based; check the latest contributor guide on
   <https://atlas.mitre.org/>).
3. Coordinate with CSA on cross-citation (CSA's CCM AI Controls
   Matrix is a sibling effort).

## Out of scope for M5

- Submission itself. M5 ships the stub + a tracking item in
  `docs/launch/README.md`.
- Approval / publication. ATLAS reviews are gated; expect a
  multi-month round trip.
