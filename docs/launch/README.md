# Launch artifacts

Five drafts + a stub for the v1.0.0 launch window. Each artifact is
**ready-to-send** — owner names, dates, and audience-specific copy
filled in. None has been published yet (the M5 contract scopes
publishing post-release).

| File                                                     | Audience                                 | Owner      | Earliest send-by       | Status |
| -------------------------------------------------------- | ---------------------------------------- | ---------- | ---------------------- | ------ |
| [csa-outreach.md](csa-outreach.md)                       | CSA `research@cloudsecurityalliance.org` | maintainer | day-of release         | draft  |
| [pulumi-discussion.md](pulumi-discussion.md)             | `pulumi/pulumi` GH Discussions           | maintainer | release + 3 days       | draft  |
| [cfp-fwd-cloudsec.md](cfp-fwd-cloudsec.md)               | FWD CloudSec                             | maintainer | per CFP deadline       | draft  |
| [cfp-bsides.md](cfp-bsides.md)                           | local BSides                             | maintainer | per CFP deadline       | draft  |
| [pulumi-blog-pitch.md](pulumi-blog-pitch.md)             | Pulumi blog editor                       | maintainer | release + 7 days       | draft  |
| [atlas-contribution-plan.md](atlas-contribution-plan.md) | MITRE ATLAS workgroup                    | maintainer | post-release follow-up | stub   |

## Send-by discipline

The post-release window matters for each artifact:

- **CSA outreach** — same day as the release. The email asks for
  written confirmation that ID-only citation (no verbatim text) is
  the supported pattern. CSA's reply may take 30+ days; we ship
  with the documented IDs-only boundary regardless. Their reply
  informs whether v1.0.1 needs a docs update.
- **Pulumi Discussion** — wait ~3 days for the release to settle
  on npm with provenance badges visible, then post. The discussion
  proposes a `pulumi-compliance-policies-frameworks` sibling repo
  in the Pulumi org so other vendors can contribute under the same
  rubric.
- **CFPs** — deadline-driven. Track in a calendar.
- **Pulumi blog** — wait until after the GH Discussion thread has
  responses; pitch references community engagement.
- **MITRE ATLAS** — stub only in M5. The contribution itself is a
  multi-week dossier-build task post-launch.

## What "ready-to-send" means

Each draft has:

1. Subject / title.
2. Intended audience (specific email or platform).
3. Body with all placeholders filled — no `<YOUR NAME>` left in.
4. Clear call-to-action.
5. PII / secrets reviewed (none).

Maintainers send by copy-pasting the draft, NOT by automation. The
release ships standalone; these drafts are post-release outreach.
