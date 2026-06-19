---
id: 010-verdict-email
unit: 001-evaluator-review
intent: 003-evaluator-review
status: draft
priority: must
created: 2026-06-17T00:00:00.000Z
assigned_bolt: 010-evaluator-review
implemented: false
---

# Story: 010-verdict-email

## User Story

**As a** factory
**I want** to be emailed whenever ODPC sends results back
**So that** I know to collect my result or revise my answers

## Acceptance Criteria

- [ ] **Given** an ODPC commit that finalizes the Cover to `finished`, **When** committed, **Then** one email is queued to `enrolls.email` with "complete + Grade" content
- [ ] **Given** an ODPC commit that bounces the Cover to `in_progress`, **When** committed, **Then** one email is queued with "revision needed" content
- [ ] **Given** a tier-1 (non-finalizing) submission or a factory re-submission, **When** committed, **Then** **no** email is queued
- [ ] **Given** the email job, **When** processed, **Then** it is delivered via the existing BullMQ `email` queue/worker using a Thai template
- [ ] **Given** the job is enqueued, **When** the verdict transaction succeeds, **Then** enqueue happens after a successful commit (not on rollback)

## Technical Notes

- Add a new `email` job type (e.g. `verdict-result`) with a `result: finished | in_progress` discriminator (or two job types); two Thai templates
- Enqueue from the finalize path (story 005) only on ODPC commit; mirror the `2fa-otp` job registration pattern
- Recipient is the Cover's `enrolls.email`
- Note (ADR-0002): this widens the login-critical email-worker surface

## Dependencies

### Requires
- 005-finalize-and-transition
- 009-grade-and-live-choice (finished email carries the grade)

### Enables
- (none — terminal)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| `enrolls.email` null/missing | Skip send / log; do not fail the transaction |
| Queue/Redis unavailable | Transaction already committed; enqueue failure logged, not rolled back |

## Out of Scope

- Evaluator-facing notifications (state-visibility only)
