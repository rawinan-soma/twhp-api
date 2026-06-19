---
id: 008-resubmit-gate
unit: 001-evaluator-review
intent: 003-evaluator-review
status: draft
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 009-evaluator-review
implemented: false
---

# Story: 008-resubmit-gate

## User Story

**As a** factory
**I want** to re-submit the Cover once I've addressed all send-backs
**So that** review resumes only when nothing is left rejected

## Acceptance Criteria

- [ ] **Given** a Cover in `in_progress` after a bounce, **When** the factory re-submits, **Then** it is allowed only if **no answer is still `rejected`** (each was accepted→`recommended` or objected/redone→`in_review`)
- [ ] **Given** a valid re-submit, **When** applied, **Then** the Cover → `in_review` (a `coverLogs` row by the factory)
- [ ] **Given** ≥1 answer still `rejected`, **When** re-submit is attempted, **Then** it is rejected with a clear error listing the outstanding answers
- [ ] **Given** re-submit, **Then** `recommended` and `finished` answers carry over untouched (sticky)

## Technical Notes

- Extend the existing factory Cover-submit path with the new gate (replaces any "all answers in_review" assumption)
- Re-evaluation: owning tier-1 re-judges `in_review` answers; ODPC converts `recommended` → `finished` at its next commit

## Dependencies

### Requires
- 007-factory-accept-object-redo

### Enables
- (loop back to 005 finalize)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| All answers already `recommended`/`finished` | Re-submit allowed; ODPC finalize is a convert/rubber-stamp |
| Cover not in `in_progress` | Reject |

## Out of Scope

- The ODPC finalize itself (005)
