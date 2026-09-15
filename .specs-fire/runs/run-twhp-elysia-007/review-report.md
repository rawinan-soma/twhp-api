---
run: run-twhp-elysia-007
work_item: retire-score-negotiation
intent: score-change-finality
generated: 2026-08-24T08:25:00Z
---

# Code Review: run-twhp-elysia-007

## Files

| File | Change |
|------|--------|
| `src/service/answer.ts` | finality guard in `negotiate`; enrichment comment rewritten; explicit type at the retained `effectiveChoice` |
| `src/service/evaluator-review.ts` | promotion rows carry `description`; `resolved` reads it; unused `settledScoreIds` removed |
| `src/routes/factories/assessments/index.ts` | response-schema comment rewritten |
| `src/service/answer.integration.test.ts` | 4 negotiation tests, settled-shape fixture |
| `src/service/evaluator-review.verdict.integration.test.ts` | promotion-row test asserts the description survives |

## Auto-fixed

Formatting on the test file; removed `settledScoreIds`, left unused when run 006's classification
settled on `settledChoiceById`. Both mechanical.

## Findings

### 1. Guard placement — MEDIUM, fixed in-run

Putting the finality check inside the `accept` branch meant it never fired for the new shape: a
`recommended` Answer is rejected earlier by `status !== "rejected"` with a generic message. Moved
ahead of that guard, so one message now covers `recommended`, `finished`, and legacy `rejected`,
for both `accept` and `redo`.

### 2. The retained `accept` body is unreachable — INFO, deliberate

Kept per the human's answer that the frontend may still call it. It costs an explicit type
annotation at `effectiveChoice`, since TypeScript no longer narrows through unreachable code. The
ADR records that removal awaits frontend confirmation.

### 3. `redo` on a settled score change is now refused — BEHAVIOUR CHANGE, intended

Previously a factory could `object`/`redo` a change-score. The intent makes the correction final,
so both actions are refused. Worth stating plainly in the ADR: the factory's right to contest a
score is gone, not merely its `accept` shortcut.

### 4. Legacy rows were a live double-write — resolved

Before this run a factory could `accept` a legacy `rejected` + `verdictChoice` row and write a
settled score behind finalize's back — two writers of one value. The guard closes it.

## Standards compliance

- ✅ Service returns `status(code, body)`; no throwing.
- ✅ No schema change; response contract unchanged.
- ✅ No file I/O added to `negotiate`.
- ✅ Comments corrected rather than left describing a retired flow.
