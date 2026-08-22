---
id: 002-past-year-write-authority
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
status: draft
priority: must
created: 2026-08-20T08:55:00Z
assigned_bolt: 032-out-of-year-writes
implemented: false
---

# Story: 002-past-year-write-authority

## User Story

**As a** DOED Admin or ODPC Evaluator
**I want** to review, score, and finalise a Cover belonging to a closed fiscal year
**So that** work left unfinished when the year turned can still be completed, without a deadline on
my own ability to complete it

## Acceptance Criteria

- [ ] **Given** a write request, **When** it is handled, **Then** the fiscal year of the *target
  record* is determined from the enrollment, and compared against the current fiscal year using the
  unit-001 resolver.
- [ ] **Given** a target year equal to the current one, **When** any authorised role writes, **Then**
  behaviour is exactly as today for every role.
- [ ] **Given** a target year other than the current one, **When** the caller is `Role.DOED` or
  `Role.Evaluator` at level `ODPC`, **Then** the write proceeds.
- [ ] **Given** a target year other than the current one, **When** the caller is any other role or
  evaluator level, **Then** the write is refused with a distinct, logged response — except where the
  Factory grace window applies (story 004).
- [ ] **Given** an ODPC caller writing a past year, **When** the request runs, **Then** the existing
  region restriction still applies; authority over a closed year does not widen geographic scope.
- [ ] **Given** this authority, **When** time passes, **Then** it does not expire; a FY2026 Cover
  remains writable by DOED and ODPC indefinitely.
- [ ] **Given** any granted out-of-year write, **When** it completes, **Then** the acting identity is
  recorded.

## Technical Notes

- Affected write paths: the evaluator and admin review and verdict routes
  (`src/routes/{admins,evaluators}/covers/[coverId]/answers/[answerId]/verdict`), the finalize routes
  (`.../covers/[coverId]/finalize`), and the answer verdict service paths in `src/service/answer.ts`.
- The target year comes from the record, not from a query parameter. A write must never be able to
  nominate its own fiscal year — that would let a caller relabel which year it is editing.
- `assertCoverAccess` in the evaluator review service is the natural place to extend, since it
  already centralises Cover-level authorisation. Confirm it is on every relevant path before relying
  on it; `docs/business-rules.md` notes that some evaluator detail routes call unscoped services.
- Preserve the `status(code, body)` return convention; do not throw.
- Refusals must stay separable from the existing wrong-region 404 so that support can distinguish
  "not allowed for this year" from "not found in your region".

## Dependencies

### Requires

- 001-evaluator-level-guard
- 001-fiscal-year-resolver (unit `001-fiscal-year-reads`)

### Enables

- 003-factory-grace-window-policy
- 006-out-of-year-write-audit

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| DOED finalising a FY2026 Cover in March 2027 | Permitted; authority does not expire |
| ODPC evaluator in region 5 targeting a FY2026 Cover in region 9 | Refused by the existing region rule, not by the year rule |
| Mental-level evaluator targeting a FY2026 Cover after rollover | Refused, logged, distinguishable from a 404 |
| A Cover whose Factory relocated regions since the addressed year | Region derives from current location — the documented FR-3 limitation, which here affects *authorisation*, not just visibility. Assert the behaviour explicitly |
| Write targeting the current year | Unchanged in every respect |

## Out of Scope

- Factory writes of any kind, owned by stories 003 and 004.
- Prior-year enrollment creation or editing, which stays refused for every role in this intent.
- Reopening a Cover that has reached `finished`.
