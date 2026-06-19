---
id: 005-finalize-and-transition
unit: 001-evaluator-review
intent: 003-evaluator-review
status: draft
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 008-evaluator-review
implemented: false
---

# Story: 005-finalize-and-transition

# User Story

**As** ODPC
**I want** my commit to override, backstop, finalize answers, and transition the Cover
**So that** I am the sole finalizer and the Cover resolves correctly

## Acceptance Criteria

- [ ] **Given** tier-1 verdicts, **When** recorded, **Then** the Cover stays `in_review` (non-finalizing)
- [ ] **Given** an ODPC batch, **When** it targets a non-`finished` answer (`in_review`/`recommended`/`rejected`), **Then** ODPC may override it (re-score, flip, approve)
- [ ] **Given** a `finished` answer, **When** any evaluator (incl. ODPC) targets it, **Then** it is immutable (rejected)
- [ ] **Given** ODPC's commit, **When** applied, **Then** every un-overridden `recommended` answer is converted to `finished`
- [ ] **Given** ODPC's commit is single-shot (always finalizing; no ODPC draft/partial-save), **When** ODPC submits, **Then** it must resolve the whole Cover in that one commit
- [ ] **Given** ODPC finalize, **When** any answer remains `in_review` or `recommended` after the batch, **Then** finalization is **invalid/rejected** (not a third outcome — must resolve all)
- [ ] **Given** a valid finalize where all answers are `finished`, **When** committed, **Then** Cover → `finished` and a `coverLogs` row is written with `evaluatorId`
- [ ] **Given** a valid finalize where ≥1 answer is `rejected`, **When** committed, **Then** Cover → `in_progress`
- [ ] **Given** any non-ODPC caller, **When** committing, **Then** no `coverLogs` transition is written

## Technical Notes

- Only ODPC writes `coverLogs`; tier-1 writes only `answerLogs`
- Status is event-sourced — derive current answer/cover state from latest log rows
- The transition computation runs over the **whole** Cover after the batch, inside the same transaction as the `answerLogs` writes

## Dependencies

### Requires
- 004-verdict-batch-endpoint

### Enables
- 006-file-deletion-on-reject
- 009-grade-and-live-choice
- 010-verdict-email

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| ODPC finalize with an untouched `in_review` answer | Invalid — ODPC must backstop it first |
| ODPC overrides its own earlier `recommended` source | Allowed pre-`finished` |
| Region has no ODPC (invariant says n/a) | Not handled at runtime (PO invariant) |

## Out of Scope

- File deletion (006), grade (009), email (010)
