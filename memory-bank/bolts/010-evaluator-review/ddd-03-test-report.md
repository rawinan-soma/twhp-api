---
stage: test-report
bolt: 010-evaluator-review
created: 2026-06-17T04:45:00Z
status: passed
---

## Test Report — Bolt 010 (Grade + Verdict Email)

### Story 009 — Grade and Live Choice

| AC | Description | Result |
|----|-------------|--------|
| AC1 | `liveChoice = answers.selectedChoice` (open verdicts don't affect score) | PASS — `selectedChoice` is the effective choice at all times; `rejected` logs don't mutate it |
| AC2 | `computeGrade` returns `gold` when all categories `>80%`, total `≥90%`, all `special>0` questions answered `"3"` | PASS — `computeGrade` top-down check; strict `>80` per category, `>=90` total, specialFull gate |
| AC3 | Category exactly 80% → fails gold (strict `>80`) → falls to silver check | PASS — `c.percentage > 80` is strict; 80% falls through to silver |
| AC4 | Overall `≥90%` but any category `≤60%` → certificate (not silver) | PASS — silver requires every category `>60%`; fails this → certificate cliff |
| AC5 | `silver` when every category `>60%` AND total `≥80%` | PASS |
| AC6 | `certificate` when total `≥60%` | PASS |
| AC7 | `joined` when total `<60%` (catch-all) | PASS |
| AC8 | `grade: null` for `in_review` Covers in `buildScoreReports` / `getScoreByFactory` | PASS — `coverStatus !== "finished"` path returns `null` |
| AC9 | `grade` included in score service response (all methods: `getScoreByFactory`, `getScoresByRegion`, `getScoresByProvince`, `getAllScores`) | PASS — `buildScoreReports` returns `grade` for all multi-cover methods; `getScoreByFactory` computes grade inline |
| AC10 | ODPC finalize response includes `grade` (non-null when Cover → `finished`, null when → `in_progress`) | PASS — `status(200, { message: "verdict submitted", grade })` |

### Story 010 — Verdict Email

| AC | Description | Result |
|----|-------------|--------|
| AC1 | BullMQ `verdict-result-finished` job enqueued after ODPC commit to `finished` | PASS — `emailQueue.add("verdict-result-finished", {...})` after transaction in `verdict()` |
| AC2 | BullMQ `verdict-result-in-progress` job enqueued after ODPC commit to `in_progress` | PASS — `emailQueue.add("verdict-result-in-progress", {...})` in the else branch |
| AC3 | Email skipped if `enrolls.safetyOfficerEmail` is null | PASS — `if (enrollData?.email)` guard before enqueue |
| AC4 | Queue failure after committed txn is caught and logged, not thrown | PASS — try/catch wraps both enqueue calls; `console.error` on error, no re-throw |
| AC5 | `verdict-result-finished` worker: sends Thai "ผ่านการประเมิน" email with grade label | PASS — `sendVerdictResultFinishedEmail` in `email.ts` with Thai content and `GRADE_LABEL` map |
| AC6 | `verdict-result-in-progress` worker: sends Thai "ต้องปรับปรุง" email | PASS — `sendVerdictResultInProgressEmail` in `email.ts` |
| AC7 | Email only triggers on ODPC commit (not tier-1 approve, not factory re-submit) | PASS — enqueue is inside the `if (level === "ODPC")` branch only |
| AC8 | Recipient is `enrolls.safetyOfficerEmail` (fetched via covers→enrolls join) | PASS — `enrollData.email = enrolls.safetyOfficerEmail` from pre-txn query |

### Build Gates

| Check | Result |
|-------|--------|
| `bunx tsc --noEmit` | PASS (0 new errors; 2 pre-existing in auth route) |
| `bunx biome check` (5 changed files) | PASS — 0 errors |

### Summary

- 10 ACs Story 009 — 10/10 PASS
- 8 ACs Story 010 — 8/8 PASS
- **Total: 18/18 ACs**
