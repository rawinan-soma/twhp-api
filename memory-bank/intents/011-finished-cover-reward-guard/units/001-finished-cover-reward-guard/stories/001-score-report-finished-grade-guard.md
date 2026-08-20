---
id: 001-score-report-finished-grade-guard
unit: 001-finished-cover-reward-guard
intent: 011-finished-cover-reward-guard
status: ready
priority: must
created: 2026-07-20T04:05:27Z
assigned_bolt: 024-finished-cover-reward-guard
implemented: false
---

# Story: 001-score-report-finished-grade-guard

## User Story

**As a** consumer of a Factory Score Report
**I want** Grade to be derived only when that Factory's Cover has a latest status of `finished`
**So that** an in-progress or in-review assessment never displays a reward

## Acceptance Criteria

- [ ] **Given** the Factory's Cover has latest status `in_review`, **When** its Score Report is built,
  **Then** the numerical scoring is returned and `grade` is `null`.
- [ ] **Given** the Factory's Cover has latest status `finished`, **When** its Score Report is built,
  **Then** the numerical scoring and existing computed Grade are returned.
- [ ] **Given** the Factory's Cover has latest status `in_progress`, **When** the Factory score endpoint
  is called, **Then** the existing `400` response remains unchanged.
- [ ] **Given** an Evaluator, Provincial, or Admin list contains `in_review` and `finished` Covers,
  **When** reports are built, **Then** in-review items have `grade: null`, finished items have Grade,
  and in-progress items remain omitted.
- [ ] **Given** multiple CoverLogs for a Cover, **When** Grade eligibility is resolved, **Then** the row
  with greatest serial ID wins regardless of timestamp or any older status.

## Technical Notes

- Primary seam: score service single-report and shared list-report builders.
- Preserve existing `calculateBreakdown` and `computeGrade`; the status gate surrounds Grade
  computation and does not alter numerical scoring.
- Add focused coverage for both latest-log ordering directions: older finished → newer in-review,
  and older in-review → newer finished.

## Dependencies

### Requires

- None

### Enables

- 003-finished-grade-contract-regression

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Cover has no CoverLog | Preserve existing in-progress fallback; no Grade |
| Older log is finished but greatest-ID log is in-review | `grade: null` |
| Greatest-ID log is finished but has an earlier timestamp | Grade returned; ID ordering is authoritative |

## Out of Scope

- Preventing a business-invalid Cover from acquiring a finished CoverLog.
- Changing score visibility during `in_review`.
