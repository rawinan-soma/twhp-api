---
stage: test
bolt: 007-evaluator-review
created: 2026-06-17T03:45:43Z
---

## Test Report: Evaluator Review — Answers List + Verdict Batch (007-evaluator-review)

### Summary

No automated test suite exists (`package.json test → exit 1`). Verification is static (code review against ACs). TypeScript type check and Biome lint both pass with zero errors/warnings on all new files.

- **Static AC verification**: 7/7 passed
- **TypeScript**: 0 errors (production files)
- **Biome**: 0 errors, 0 warnings

---

### Acceptance Criteria Validation

#### Story 003-answers-list-endpoint

- ✅ **AC 1** — `GET /twhp/api/evaluators/covers/:coverId/answers` returns only the caller's categories (hard server-side filter)
  - `service/evaluator-review.ts:getAnswers`: `categoriesFor(evaluator.level)` → `inArray(questions.category, categories)` applied in the DB query. Mental gets `["Mental"]`, DOH gets `["Disease","Safety"]`, ODPC gets all 5. No filtering bypassed.

- ✅ **AC 2** — Each returned answer includes `answerStatus`, `category`, `selectedChoice`, latest `verdictChoice` + `description`
  - `getAnswers` selects `answers.id`, `questions.category`, `answers.selectedChoice` from the join, then fetches latest `answerLogs` via `selectDistinctOn([answerLogs.answerId])` ordered by `desc(answerLogs.id)`. Returns `{ answerId, questionId, category, status, selectedChoice, latestVerdictChoice, latestDescription }`. `latestVerdictChoice` and `latestDescription` are nullable (null if no log yet).

- ✅ **AC 3** — Cover outside caller's region is not returned
  - `assertCoverInRegion` joins `covers → enrolls → factories → provinces` and filters by `provinces.healthRegion = evaluator.region`. Returns `status(404)` if not found, before the answer query runs.

- ✅ **AC 4** — Non-evaluator caller blocked by `evalGuard`/404
  - Route uses `evalGuard` (Evaluator JWT role check). `getEvaluatorData` returns `status(404)` for valid JWT but no evaluator row.

#### Story 004-verdict-batch-endpoint

- ✅ **AC 1** — Any out-of-scope entry rejects the whole batch with `403`
  - `service/evaluator-review.ts:verdict`: after fetching `categoryMap` for all batch `answerId`s, `outOfScope = answerIds.some(id => !categories.includes(categoryMap.get(id)))`. Single check, returns `status(403)` before the transaction opens. No partial writes possible.

- ✅ **AC 2** — `change_score` requires `verdictChoice ∈ {0,1,2,3}` + non-empty `description`
  - TypeBox `ChangeScoreEntrySchema`: `verdictChoice: t.Union([t.Literal("0")…t.Literal("3")])` + `description: t.String({ minLength: 1 })`. Elysia rejects at parse layer before service is called.

- ✅ **AC 3** — `reject` requires `description`; `approve` requires neither
  - TypeBox `RejectEntrySchema`: `description: t.String({ minLength: 1 })`. `ApproveEntrySchema` has no optional fields beyond `answerId` + `decision`.

- ✅ **AC 4** — All `answerLogs` written in one transaction; `eval_id` set
  - `verdict`: all validation done before `database.transaction(async tx => { for (row of logRows) tx.insert(answerLogs).values(row) })`. `eval_id: evaluator.accountId` set on every row.

- ✅ **AC 5** — Tier-1 `approve` → `recommended`; ODPC `approve` → `finished`
  - `resolveOutcomeStatus`: `entry.decision === "approve" ? (level === "ODPC" ? "finished" : "recommended") : "rejected"`. Applied in `logRows` mapping before transaction.

- ✅ **AC 6** — `change_score`/`reject` → `rejected`
  - Same `resolveOutcomeStatus` logic: non-`approve` decisions always produce `"rejected"`.

- ✅ **AC 7** — Entries targeting non-actionable answers (e.g. `finished`) are rejected
  - Actionability loop before transaction:
    - `"finished"` → `status(400, "answer X is already finalized")` for any caller
    - `"recommended"` + non-ODPC → `status(403, "answer X is recommended; only ODPC can override")`

#### Edge Cases

| Scenario | Handled |
|----------|---------|
| Empty batch | TypeBox `minItems: 1` rejects before service |
| Duplicate `answerId` in batch | `status(400)` check: `new Set(answerIds).size !== answerIds.length` |
| `answerId` not in this cover | `status(400)` check: `answerRows.length !== answerIds.length` |
| Cover with no answers for level | `getAnswers` returns `[]` (early return before log query) |
| Answer already `finished` | `status(400)` per actionability check |
| Tier-1 trying to override `recommended` | `status(403)` per actionability check |

---

### Issues Found

None. TypeScript and Biome clean.

---

### Recommendations

- Integration tests at bolt 008 (finalize) would exercise this bolt's transaction logic end-to-end.
- Consider adding an OpenAPI example payload to the verdict route's `detail` for clarity on the discriminated union shape.
