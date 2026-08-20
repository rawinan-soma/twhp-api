---
intent: 011-finished-cover-reward-guard
phase: inception
status: inception-complete
created: 2026-07-20T03:57:33Z
updated: 2026-07-20T04:12:29Z
---

# Requirements: Finished-Cover Reward Guard

## Intent Overview

Ensure the API returns a reward Grade (`gold`, `silver`, `certificate`, or `joined`) only when the
Cover's latest `CoverLog` status is `finished`. For every other Cover status, the Grade is `null` or
absent where the existing response contract already omits it. Numerical score availability,
calculation formulas, endpoint paths, response shapes, authorization, finalization transitions,
email selection, and every other workflow behavior remain unchanged.

This is a brown-field defect-prevention intent. Current source already contains conditional Grade
logic in the main score and finalize paths; this intent makes that rule an explicit, consistently
tested contract across all reward-returning surfaces.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Prevent premature reward disclosure | No API response or result email exposes a non-null Grade unless the latest committed `CoverLog` is `finished` | Must |
| Preserve existing assessment behavior | Score visibility, endpoints, payload structure, authorization, and workflow transitions have no behavior change | Must |
| Keep every role-facing surface consistent | Factory, Evaluator, Provincial Officer, Admin, and finalize results apply the same finished-only Grade rule | Must |

---

## Functional Requirements

### FR-1: Latest `CoverLog` is the Grade eligibility authority

- **Description**: Grade eligibility is determined exclusively from the Cover's current status,
  defined as the `CoverLog` row with the greatest serial `id` for that Cover. Timestamps are not used
  to resolve status. A Cover without a log retains the existing `in_progress` fallback behavior.
- **Acceptance Criteria**:
  - A Cover whose latest `CoverLog.status` is `finished` is eligible for Grade calculation and return.
  - A Cover whose latest status is `in_review` or `in_progress` is not eligible for a Grade.
  - An older `finished` log followed by a newer non-finished log does not make the Cover Grade-eligible.
  - An older non-finished log followed by a newer `finished` log makes the Cover Grade-eligible.
- **Priority**: Must
- **Related Stories**: TBD

### FR-2: Score reports return Grade only for finished Covers

- **Description**: Every single and list Score Report derives Grade eligibility using FR-1. Grade is
  computed on demand only for eligible Covers; non-finished reports carry `grade: null` under the
  existing nullable response contract.
- **Acceptance Criteria**:
  - When the Factory's Cover is `in_review`, its score report continues to return the numerical score
    with `grade: null`.
  - When the Factory's Cover is `finished`, its score report returns the numerical score and its
    computed Grade.
  - When the Factory's Cover is `in_progress`, its score report continues to return the existing
    `400` response.
  - Evaluator, Provincial Officer, and Admin score lists continue to omit `in_progress` Covers.
  - Every included `in_review` list item contains `grade: null`.
  - Every included `finished` list item contains the Grade computed by the existing Grade formula.
- **Priority**: Must
- **Related Stories**: TBD

### FR-3: Finalize returns and emails Grade only after a finished transition commits

- **Description**: The shared evaluator/admin finalize operation returns or queues a Grade only when
  its committed `CoverLog` transition is `finished`. A transition to `in_progress` for revision does
  not calculate or expose a reward.
- **Acceptance Criteria**:
  - After a successful `finished` transition is committed, finalize returns the computed Grade and
    the finished-result email payload includes that Grade.
  - After a successful `in_progress` transition is committed, finalize returns `grade: null` and the
    revision email payload contains no Grade.
  - A failed or aborted finalize does not return or enqueue a Grade.
  - Evaluator and Admin finalize routes retain identical behavior through the shared service.
- **Priority**: Must
- **Related Stories**: TBD

### FR-4: Existing API and scoring contracts remain unchanged

- **Description**: This intent changes only Grade eligibility/return behavior. All endpoints and
  non-Grade fields retain their current contracts.
- **Acceptance Criteria**:
  - No endpoint is added, removed, or renamed.
  - No request schema, authorization rule, status code, or non-Grade response field is changed.
  - Numerical scores remain available for `in_review` and `finished` Covers exactly as today.
  - The existing score formula, category breakdown, Grade thresholds, and special-question Grade
    gate are unchanged.
  - `ScoreReportSchema.grade` and finalize response `grade` remain nullable under their existing
    response shapes.
- **Priority**: Must
- **Related Stories**: TBD

### FR-5: Finished-only Grade regression coverage

- **Description**: Focused automated tests protect the finished-only reward contract at service and
  route-schema seams without requiring a change to unrelated workflow rules.
- **Acceptance Criteria**:
  - Tests cover `in_progress`, `in_review`, and `finished` status outcomes.
  - Tests cover latest-log-wins ordering with multiple `CoverLog` rows.
  - Tests cover the factory Score Report and evaluator/provincial/admin list reports.
  - Tests cover evaluator/admin finalize parity for both `finished` and `in_progress` outcomes.
  - Tests assert both positive behavior (finished returns Grade) and negative behavior
    (non-finished never returns a non-null Grade).
- **Priority**: Must
- **Related Stories**: TBD

---

## Non-Functional Requirements

### Consistency

| Requirement | Metric | Target |
|-------------|--------|--------|
| Cross-surface Grade eligibility | Reward-returning API paths using the same latest-status rule | 100% |
| Non-finished reward suppression | Non-finished responses/emails containing a non-null Grade | 0 |

### Compatibility

| Requirement | Metric | Target |
|-------------|--------|--------|
| Endpoint compatibility | Added, removed, or renamed endpoints | 0 |
| Non-Grade contract regressions | Changed status codes, score fields, authorization, or formulas | 0 |

---

## Constraints

### Technical Constraints

- Use the existing latest-log-wins convention: greatest `CoverLogs.id`, not timestamp.
- Keep Grade on demand; do not persist Grade or add a database schema change.
- Preserve the existing score/Grade helpers and service factory/singleton pattern.
- Keep evaluator and Admin finalize behavior in the shared evaluator-review service.

### Business Constraints

- “Reward” in this intent means only the Grade values `gold`, `silver`, `certificate`, and `joined`.
- Numerical score visibility during `in_review` remains unchanged.
- Preventing an incomplete Cover from being marked `finished` is out of scope.
- Repairing historical Covers or previously returned rewards is out of scope.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| `CoverLog.status = finished` is sufficient business authorization to expose a Grade | A prematurely finalized Cover can still receive a Grade | Explicitly accepted scope; completeness/finalization integrity requires a separate intent |
| Existing clients accept `grade: null` for non-finished Score Reports and finalize outcomes | A client may incorrectly treat null as an error | Preserve the current nullable schema and add contract regression tests |
| Grade is not exposed by any persistence or external path outside Score Reports, finalize responses, and finished-result email jobs | An unreviewed path could leak Grade | Construction must inventory all `grade` producers before declaring completion |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Should numerical scoring be hidden until `finished`? | Product Owner | 2026-07-20 | Resolved: No; scoring and endpoints remain unchanged |
| Should this intent prevent incomplete Covers from becoming `finished`? | Product Owner | 2026-07-20 | Resolved: No; only Grade return eligibility is in scope |
