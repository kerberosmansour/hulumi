# `docs/slo/` — Hulumi runbooks and milestone artifacts

Everything under this directory is **work / task information** produced by the [SunLitOrchestrate](https://github.com/kerberosmansour/SunLitOrchestrate) `/slo-*` skill pack: runbooks, milestone outputs, design notes, research dossiers, and templates. Code-level documentation (`docs/ARCHITECTURE.md`, `docs/getting-started.md`, `docs/development.md`, `docs/cookbooks/`, `docs/components/`, `docs/mappings/`, etc.) lives one level up at `docs/`.

## Layout

| Path                                | What lives here                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`current/`](current/)              | Runbooks for work currently in progress (one milestone tagged `in_progress`).                                                                         |
| [`completed/`](completed/)          | Runbooks whose every milestone is `done`. A runbook moves here once `/slo-retro` closes the last milestone.                                            |
| [`future/`](future/)                | Runbooks queued up but not yet started (every milestone `not_started`). Drop them into `current/` when work begins.                                   |
| [`templates/`](templates/)          | Runbook templates (`runbook-template_v_4_template.md`) and supporting reference templates.                                                             |
| [`idea/`](idea/)                    | `/slo-ideate` outputs — the YC-style interrogation that precedes every runbook.                                                                       |
| [`research/`](research/)            | `/slo-research` dossiers (one subdirectory per slug).                                                                                                  |
| [`design/`](design/)                | `/slo-architect` outputs — overview, interfaces, threat model, stack decision per slug.                                                                |
| [`critique/`](critique/)            | `/slo-critique` four-persona adversarial reviews.                                                                                                       |
| [`completion/`](completion/)        | Per-milestone completion summaries written by `/slo-retro`.                                                                                            |
| [`lessons/`](lessons/)              | Per-milestone lessons-learned files written by `/slo-retro`.                                                                                           |
| [`runbook-milestones/`](runbook-milestones/) | Per-milestone scoping detail referenced from the parent runbook (older convention; new runbooks fold this into the runbook body).                  |
| [`verify/`](verify/)                | `/slo-verify` smoke and runtime QA reports.                                                                                                            |

## Runbook lifecycle

```
future/  →  current/  →  completed/
   ▲           │             │
   │           │             │
ideate/    plan +         retro M_last
research/  execute +      moves it here
architect/ verify
critique/
```

A runbook moves between `future/`, `current/`, `completed/` based on its **Milestone Tracker**: the moment the first milestone flips from `not_started` to `in_progress`, move the file from `future/` → `current/`; the moment the last milestone flips to `done`, move it from `current/` → `completed/`.

The supporting subdirectories (`design/`, `idea/`, `research/`, `critique/`, `completion/`, `lessons/`, `verify/`) stay flat — they are indexed by slug, not by lifecycle phase.

## Hulumi-specific notes

- Hulumi pre-dated this layout; some completed runbooks (`RUNBOOK-hulumi.md`, `RUNBOOK-hulumi-github.md`, `RUNBOOK-hulumi-k8s.md`) were authored against the v3 template. The combined `RUNBOOK-hulumi-operations-k8s-security.md` is the first Hulumi runbook authored against v4 and exercises Carmack-style reliability controls (debugger-first inspection, mandatory static analysis, assertion-driven invariants, bounded resource design, "make invalid states unrepresentable").
- The standalone `RUNBOOK-hulumi-operations.md` was superseded by the combined runbook before any milestone began. It remains in `completed/` as a historical artifact — its 5 milestones were delivered as M7–M11 of the combined runbook.
