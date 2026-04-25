# CSA outreach — ID-only citation confirmation

**To**: research@cloudsecurityalliance.org
**Subject**: Open-source compliance tooling citing CCM/AICM/CIS IDs
under Apache-2.0 — confirmation request

---

Hello CSA Research team,

I'm releasing **Hulumi v1.0.0** today
(`https://github.com/kerberosmansour/hulumi`), an Apache-2.0
open-source toolkit for hardened Pulumi components, CrossGuard
policy packs, and a drift classifier. The toolkit cites CSA Cloud
Controls Matrix v4.1 control IDs (e.g. `CCM:DSP-01`) inside its
source code and CrossGuard rule descriptions.

Per the CCM & AICM Licensing FAQ
(<https://cloudsecurityalliance.org/artifacts/ccm-aicm-licensing-faq>,
2026-03-13), I understand the boundary as: **control IDs are
factual identifiers and may be cited freely**; verbatim
implementation guidelines, CAIQ question text, and other narrative
prose require a CSA commercial license. Hulumi ships **IDs only**
— no verbatim CCM / AICM / CAIQ text in source. The boundary is
enforced by an automated lint
(`scripts/license-boundary-lint.mjs`) on every PR.

I'd like written confirmation of two points:

1. The IDs-only citation pattern, as documented in
   `docs/mappings/licensing.md`, is consistent with the CSA
   licensing FAQ as of 2026.
2. CSA does not object to an Apache-2.0 project shipping these
   citations alongside CrossGuard policy IDs and threat-model
   references in a Claude Code skill.

If a different boundary is preferred, please advise and I'll adjust
in v1.0.1.

Thank you,
Sherif Mansour
maintainer, Hulumi
`security@hulumi.io`

---

**Internal notes (not part of the email):**

- Send same day as `v1.0.0` tag is pushed.
- Expected reply window: 30+ days. Track in a calendar.
- If CSA replies with a different boundary, schedule a v1.0.1
  docs-only release that adjusts `docs/mappings/licensing.md` +
  the SKILL.md citation guidance.
