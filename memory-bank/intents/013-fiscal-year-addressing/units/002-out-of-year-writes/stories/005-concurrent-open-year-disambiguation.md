---
id: 005-concurrent-open-year-disambiguation
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 034-out-of-year-writes
implemented: false
---

# Story: 005-concurrent-open-year-disambiguation

## User Story

**As a** Factory working through October with last year's assessment unfinished and this year's
enrollment already open
**I want** every read and write to be unambiguous about which year it means
**So that** I never submit an answer against the wrong year, or see last year's data believing it is
this year's

## Acceptance Criteria

- [ ] **Given** a Factory holding both a grace-window FY2026 Cover and a new FY2027 enrollment,
  **When** it calls any self-read without `fiscalYear`, **Then** it receives the **current** year's
  record.
- [ ] **Given** the same Factory, **When** it calls a self-read with `fiscalYear=2026`, **Then** it
  receives the grace-window record.
- [ ] **Given** the same Factory, **When** it writes without any year indication, **Then** the write
  targets the record the request addresses, and that record's own year determines authorisation —
  never an implicit "most recent" selection.
- [ ] **Given** `coverService.create` for the new year, **When** it runs, **Then** it succeeds; its
  duplicate check keys on `enroll_id` (`src/service/cover.ts:30-33`) and so does not collide with the
  prior year's Cover. **This is asserted by test, not assumed.**
- [ ] **Given** any `.limit(1)` self-read in `enroll`, `cover`, `answer`, or `score`, **When** two
  open years exist, **Then** no path returns a row from the year not requested.
- [ ] **Given** enrollment creation for the new year during the grace window, **When** it runs,
  **Then** it succeeds and is unaffected by the prior year's unfinished state.

## Technical Notes

- This is the story most likely to surface a latent defect, because the two-open-years condition
  cannot occur in the system as it stands today. Every `.limit(1)` self-read was written under the
  assumption that a Factory has at most one live enrollment.
- Enumerate them explicitly: `src/service/enroll.ts:518`, `src/service/cover.ts:50`,
  `src/service/answer.ts:350,397`, `src/service/score.ts:177`.
- Because BR-07 gains no database constraint in this intent, "one enrollment per factory per year"
  remains an application rule. This story must not be read as making self-reads deterministic in
  general — only as making the *year* unambiguous.
- The default must be the current year. A Factory in October is primarily working the new year; the
  old one is the exception and should require naming.

## Dependencies

### Requires

- 004-grace-window-cover-completion
- 004-factory-self-read-fiscal-year-addressing (unit `001-fiscal-year-reads`)

### Enables

- 006-out-of-year-write-audit

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Factory has FY2026 in grace but has not yet enrolled for FY2027 | Default self-read returns the existing not-found response for FY2027; FY2026 remains reachable by naming it |
| Factory enrols FY2027 on 2026-10-02 while FY2026 is still `in_progress` | Both exist; both addressable; neither shadows the other |
| Factory submits FY2026 during grace, then reads without a parameter | Sees FY2027 — the current year — not the just-submitted FY2026 |
| Score read during the window with no parameter | Current year's score, subject to the existing finished-Cover reward rule |
| Grace lapses while both years exist | FY2026 becomes read-only to the Factory; FY2027 unaffected |

## Out of Scope

- Presenting a year switcher or any client-side affordance; that is the frontend's concern.
- Making self-reads deterministic in the presence of duplicate enrollments within one year — that
  requires the unique constraint this intent forgoes.
