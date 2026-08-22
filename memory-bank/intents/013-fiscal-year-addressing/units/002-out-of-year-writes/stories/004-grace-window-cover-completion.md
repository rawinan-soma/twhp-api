---
id: 004-grace-window-cover-completion
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 033-out-of-year-writes
implemented: false
---

# Story: 004-grace-window-cover-completion

## User Story

**As a** Factory that had not finished its assessment when the fiscal year turned
**I want** a month in which I can still complete and submit it
**So that** a year of work is not lost to a boundary I crossed by a few days

## Acceptance Criteria

- [ ] **Given** a Factory whose immediately-prior-year Cover has not reached `finished`, **When** it
  saves or updates an answer during the grace window, **Then** the write succeeds exactly as it would
  have before the boundary, including evidence file handling.
- [ ] **Given** the same Factory and window, **When** it submits the Cover, **Then** the transition
  `in_progress → in_review` is written as today (`src/service/answer.ts:344`).
- [ ] **Given** a Factory attempting to **create or edit a prior-year enrollment** during the window,
  **When** the request runs, **Then** it is refused. Grace covers Cover completion only.
- [ ] **Given** a prior-year Cover that has already reached `finished`, **When** a Factory attempts
  to write during the window, **Then** it is refused; grace does not reopen completed work.
- [ ] **Given** the same Factory after 2026-10-31, **When** it attempts any prior-year write, **Then**
  it is refused with the distinct, logged out-of-year response.
- [ ] **Given** any grace-window write, **When** it completes, **Then** the acting Factory and the
  fact that grace authorised it are recorded.
- [ ] **Given** grace-window answer submission with evidence files, **When** it runs, **Then** file
  I/O stays outside the database transaction, per the existing pattern.

## Technical Notes

- Central seam: `src/service/answer.ts` — `saveAnswer` (`:15`), the update paths (`:216`, `:676`),
  and the Cover submission at `:344`.
- The upload-then-transact ordering in `src/service/answer.ts` is a project rule (`CLAUDE.md`) and
  matters more here, not less: a grace-window submission that partially fails near the window's end
  must not leave orphaned objects or a half-submitted Cover.
- Per-answer verdict behaviour from `008-per-answer-verdict-save` and the finished-Cover reward guard
  from `011-finished-cover-reward-guard` are preserved unchanged. A Cover submitted during grace
  follows the same downstream rules as one submitted before the boundary.
- Grace authorises the Factory only for *its own* Cover. The `factoryId` continues to come from the
  JWT subject.
- Once a grace-window Cover reaches `in_review`, DOED and ODPC authority (story 002) carries it the
  rest of the way, with no deadline.

## Dependencies

### Requires

- 003-factory-grace-window-policy
- 002-past-year-write-authority

### Enables

- 005-concurrent-open-year-disambiguation
- 006-out-of-year-write-audit

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Factory submits at 2026-10-31 23:59:59 Bangkok | Accepted |
| Factory submits at 2026-11-01 00:00:01 Bangkok | Refused, logged as out-of-year |
| Factory never enrolled in the prior year | Existing not-found response; grace grants nothing to create |
| Factory's prior-year Cover is `in_review` when the window opens | Factory writes refused — it is no longer the Factory's to advance; ODPC/DOED own it |
| Factory tries to fix a prior-year enrollment headcount during grace | Refused, per the Checkpoint 2 scope decision |
| Upload succeeds but the transaction fails mid-submission | Existing compensation behaviour applies unchanged; no new orphan class is introduced by grace |

## Out of Scope

- Any change to what a submitted Cover means downstream — scoring, verdicts, and grade rules are untouched.
- Enrollment writes of any kind.
- Notifying the Factory that the window is closing.
