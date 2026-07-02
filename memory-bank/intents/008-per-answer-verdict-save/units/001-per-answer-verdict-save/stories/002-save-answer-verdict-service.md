---
id: 002-save-answer-verdict-service
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
status: complete
priority: must
created: 2026-07-02T00:00:00.000Z
assigned_bolt: 019-per-answer-verdict-save
implemented: true
---

# Story: 002-save-answer-verdict-service

# User Story

**As** an Evaluator (tier-1 or ODPC)
**I want** to save my verdict for one Answer at a time
**So that** my review work is persisted immediately and I can resume later

## Acceptance Criteria

- [ ] **Given** `saveAnswerVerdict(coverId, answerId, reviewer, entry)`, **When** called, **Then** it verifies cover access (region-scoped for evaluators; existence-only for national ODPC) → `404` if not accessible
- [ ] **Given** the target Answer, **When** it does not belong to the Cover, **Then** `400`/`404` (not found in this cover)
- [ ] **Given** the caller's level, **When** the Answer's category is outside the caller's owned categories, **Then** `403` (out-of-scope)
- [ ] **Given** a valid save, **When** applied, **Then** exactly **one** `answerLogs` row is appended with `eval_id = reviewer.accountId`
- [ ] **Given** `decision = approve`, **When** saved, **Then** status is **`recommended`** regardless of level (tier-1 **and** ODPC) with null `verdict_choice`/`description`
- [ ] **Given** `decision = change_score`, **When** saved, **Then** status `rejected` with `verdict_choice` (`0`–`3`) + `description`
- [ ] **Given** `decision = reject`, **When** saved, **Then** status `rejected`, null `verdict_choice`, + `description`
- [ ] **Given** `change_score` whose `verdictChoice` equals the Answer's current live choice, **When** saved, **Then** `400` (no-op; use approve)
- [ ] **Given** any save, **When** it completes, **Then** it performs **no** MinIO I/O, **no** `coverLogs` write, and **no** email enqueue
- [ ] **Given** a completed save, **When** it returns, **Then** the response reports the Answer's new status

## Technical Notes

- Extract the single-Answer path from the old batch loop in `evaluator-review.ts` (existence/scope/no-op checks) into `saveAnswerVerdict`.
- No `finished` is ever written here (see 004 / FR-5) — approve is always `recommended`.
- Append-only: re-saving is the edit mechanism (guarded by 003).

## Dependencies

### Requires
- 001-verdict-schema-refactor

### Enables
- 003-authorship-edit-guard
- 004-odpc-finalize-action
- 005-save-and-finalize-routes

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Save on an Answer already `rejected`/`in_review` | Allowed (new log appended) — subject to 003 guard |
| Save with a category the caller owns but Answer belongs to another cover | Rejected (`400`/`404`) |
| ODPC approve during review | Writes `recommended` (revocable), not `finished` |

## Out of Scope

- The edit/immutability guard details (003); cover transition + finalize (004).
