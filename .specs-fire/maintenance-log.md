# FIRE Maintenance Log

## 2026-08-20T09:10:00Z — AI-DLC → FIRE migration

**Triggered by**: user request to switch flows and migrate intent `013-fiscal-year-addressing`.

### Initialization

`.specs-fire/` did not exist, although `.specsmd/manifest.yaml` already declared `flow: fire`
(installed 2026-08-19). This is the first FIRE initialization for this project.

- Workspace detected as **brownfield / monolith** — no `nx.json`, `turbo.json`,
  `pnpm-workspace.yaml`, `lerna.json`, `rush.json`, or `package.json` `workspaces` field.
- `autonomy_bias: balanced` — chosen by the user.
- `run_scope_preference: single` — initial default; no history to learn from yet.

### Standards

Ported from `memory-bank/standards/` rather than regenerated, so the AI-DLC decisions carry forward
intact:

| File | Origin |
|------|--------|
| `tech-stack.md` | copied verbatim |
| `coding-standards.md` | copied verbatim |
| `system-architecture.md` | copied verbatim |
| `api-conventions.md` | copied verbatim (extra to the FIRE schema; retained deliberately) |
| `data-stack.md` | copied verbatim (extra to the FIRE schema; retained deliberately) |
| `decision-index.md` | copied verbatim (extra to the FIRE schema; retained deliberately) |
| `constitution.md` | **newly written** — derived from `CLAUDE.md` and `AGENTS.md`; no AI-DLC equivalent existed |
| `testing-standards.md` | **newly written** — derived from `docs/testing.md`; no AI-DLC equivalent existed |

`constitution.md` records that `CLAUDE.md` remains authoritative where the two disagree.

### Intent migration

`013-fiscal-year-addressing` → `.specs-fire/intents/fiscal-year-addressing/`.

The 6 planned bolts map 1:1 onto 6 work items — a bolt is already an execution session, and FIRE
requires a work item to be completable in a single run. The 12 stories fold in as acceptance
criteria; each work item records its source stories.

| FIRE work item | AI-DLC bolt | Complexity | Mode |
|----------------|-------------|------------|------|
| `fiscal-year-resolver` | `029-fiscal-year-reads` | high | validate |
| `fiscal-year-read-addressing` | `030-fiscal-year-reads` | medium | confirm |
| `fiscal-year-boundary-tests` | `031-fiscal-year-reads` | medium | confirm |
| `past-year-write-authority` | `032-out-of-year-writes` | high | validate |
| `factory-grace-window` | `033-out-of-year-writes` | high | validate |
| `concurrent-years-and-audit` | `034-out-of-year-writes` | medium | confirm |

The AI-DLC unit boundary (`001-fiscal-year-reads` / `002-out-of-year-writes`) has no FIRE
equivalent — FIRE's hierarchy is Intent → Work Item → Run, with no unit layer. The separation is
preserved instead through the dependency graph and through the trim-point note in `brief.md`.

### Not migrated

Intents `001`–`012` remain in `memory-bank/` only. They are complete, and FIRE runs are execution
records — synthesising runs and walkthroughs for work that was executed under a different flow would
fabricate history rather than migrate it. The AI-DLC artifacts stay as the record of that work.

`memory-bank/intents/013-fiscal-year-addressing/` and `memory-bank/bolts/029-034/` are likewise
retained as the authoritative record of how these decisions were reached — requirements with 8 FRs
and 5 NFR groups, system context, 2 units, 12 stories, and the two checkpoint reviews.

---
