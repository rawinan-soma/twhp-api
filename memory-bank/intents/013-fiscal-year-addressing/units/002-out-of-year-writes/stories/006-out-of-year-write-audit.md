---
id: 006-out-of-year-write-audit
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 034-out-of-year-writes
implemented: false
---

# Story: 006-out-of-year-write-audit

## User Story

**As a** DOED Admin accountable for the integrity of closed fiscal years
**I want** every out-of-year write attributable, and every expired Cover left plainly as it is
**So that** I can tell who changed a closed year and when, and can distinguish an unfinished
assessment from a completed one without a status the system does not have

## Acceptance Criteria

- [ ] **Given** any granted out-of-year write — DOED, ODPC, or grace-window Factory — **When** it
  completes, **Then** the acting identity, the target fiscal year, and the authority that permitted
  it are recorded.
- [ ] **Given** any refused out-of-year write, **When** it is rejected, **Then** it is logged
  distinguishably from the existing wrong-region 404 and from a genuine not-found.
- [ ] **Given** a Cover still `in_progress` when the grace window closes, **When** the window lapses,
  **Then** **no** status transition occurs, **no** `coverLogs` row is written by expiry itself, and
  **no** scheduled job or sweep touches it. It simply remains `in_progress`.
- [ ] **Given** such a Cover, **When** any role reads it, **Then** it is visible per FR-3, and
  **When** DOED or ODPC writes it, **Then** that remains permitted indefinitely per story 002.
- [ ] **Given** such a Cover, **When** scoring runs, **Then** it is excluded exactly as today —
  `SCORABLE_STATUSES` is already `in_review`/`finished` (`src/service/score.ts:26`) and **no change
  is made** to achieve this.
- [ ] **Given** any Cover status transition that does occur through a granted out-of-year write,
  **When** it is written, **Then** it produces a `coverLogs` entry with its actor, as today.

## Technical Notes

- `coverStatus` is a fixed pgEnum — `finished` | `in_progress` | `in_review`
  (`src/drizzle/schema.ts:296`). Adding an `expired` value would be a schema change and is
  unavailable. No substitute state is invented in its place; this was decided at Checkpoint 2.
- Expiry is therefore **a change in who may write, not a change in what the Cover is**. There is
  nothing to migrate, sweep, or mark. Resist the instinct to add a nightly job — the only repeatable
  job in the system remains the 08:30 daily mail (`src/workers.ts:9`), and this intent adds none.
- Use the existing logging flow. `onError` classifies expected errors and `onAfterResponse` logs
  unlogged 4xx (`src/index.ts`); do not add ad-hoc `console.log` for these refusals.
- `coverLogs` already carries `evaluatorId` (`src/drizzle/schema.ts:313`). Confirm whether it can
  attribute a grace-window Factory write before assuming it can; if it cannot, attribution for those
  writes belongs in the request log rather than in a new column.
- A permanently `in_progress` Cover is a legitimate terminal reality of this design. Documentation
  should say so plainly, so that a future reader does not mistake it for an unhandled case.

## Dependencies

### Requires

- 002-past-year-write-authority
- 004-grace-window-cover-completion
- 005-concurrent-open-year-disambiguation

### Enables

- None; terminal story of the intent.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| FY2026 Cover still `in_progress` in 2029 | Still `in_progress`; still readable; still writable by DOED/ODPC; still non-scorable |
| DOED finalises a FY2026 Cover long after the grace window | Permitted, logged, attributed, and a `coverLogs` entry is written for the transition |
| Mental-level evaluator attempts a FY2026 write | Refused and logged, distinguishable from a 404 |
| Grace-window Factory submission | Logged with the acting Factory and the grace authority that allowed it |
| DOED reporting over a year containing permanently `in_progress` Covers | They appear as what they are — unfinished — with no synthetic status |

## Out of Scope

- Adding a Cover status, a flag column, or any persisted expiry marker.
- Any scheduled job, sweep, or batch reconciliation.
- Notifying anyone of expiry.
- Reporting or analytics over closed years, which belongs to a separate intent.
