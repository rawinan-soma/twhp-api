---
run: run-twhp-elysia-008
work_item: finalize-email-changed-answers
intent: score-change-finality
generated: 2026-08-24T08:47:00Z
---

# Code Review: run-twhp-elysia-008

## Files

| File | Change |
|------|--------|
| `src/service/answer.integration.test.ts` | end-to-end factory-view coverage; `answerIdByQ` map; review-service import |

No production files changed. Verified with `git status src/worker/ src/queue/` — empty.

## Findings

### 1. The test runs a real `finalize` — INFO, deliberate

Rather than hand-seeding `finished` logs, it drives the actual service so the assertion covers the
promotion, the `selectedChoice` write, and the read in one pass. The email queue is spied out so no
job reaches Redis; the spy is restored in the same block.

### 2. Fixture mutation ordering — LOW

The new `beforeAll` appends logs and finalizes the shared fixture Cover, so it must remain the last
`describe` in the file. Any suite added after it would see a `finished` Cover. Noted in the file's
section comment rather than enforced structurally.

### 3. The original claim is unrecoverable — MEDIUM, open by design

Carried from the design checkpoint, restated because this run closed the last channel that could
have surfaced it. Not a defect in this run's code; a consequence the ADR must record.

## Standards compliance

- ✅ No production change, as planned.
- ✅ No new dependency.
- ✅ Test drives services, not raw SQL, for the behaviour under assertion.
