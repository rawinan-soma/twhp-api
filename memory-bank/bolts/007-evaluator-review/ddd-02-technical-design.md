---
stage: technical-design
bolt: 007-evaluator-review
created: 2026-06-17T03:45:43Z
---

## Technical Design: Evaluator Review — Answers List + Verdict Batch (007-evaluator-review)

---

### Architecture Pattern

**Layered Architecture (existing pattern)** — no new pattern.

Two new routes + one new service + one new schema file:
1. **Route** — `src/routes/evaluators/covers/[coverId]/answers/index.ts`
2. **Route** — `src/routes/evaluators/covers/[coverId]/verdict/index.ts`
3. **Service** — `src/service/evaluator-review.ts` (new, factory pattern)
4. **Schema** — `src/schema/evaluator-review.ts` (request/response DTOs)

---

### Layer Structure

```text
┌──────────────────────────────────────────────────────────────────┐
│ Presentation  │  src/routes/evaluators/covers/[coverId]/...      │
│               │  evalGuard + TypeBox validation + OpenAPI detail  │
├──────────────────────────────────────────────────────────────────┤
│ Application   │  src/service/evaluator-review.ts                 │
│               │  getAnswers() + verdict()                         │
├──────────────────────────────────────────────────────────────────┤
│ Domain        │  src/schema/evaluator-review.ts (DTOs)           │
│               │  outcome/actionability logic (in service)         │
├──────────────────────────────────────────────────────────────────┤
│ Infrastructure│  answerLogs (write) + answers+questions (read)    │
└──────────────────────────────────────────────────────────────────┘
```

---

### API Design

#### `GET /twhp/api/evaluators/covers/:coverId/answers`

- **Auth**: `evalGuard` (Evaluator role + JWT)
- **Path param**: `coverId: number`
- **Response 200**: `AnswerViewItem[]`
- **Response 403/404**: cover not in region / evaluator not found

#### `POST /twhp/api/evaluators/covers/:coverId/verdict`

- **Auth**: `evalGuard`
- **Path param**: `coverId: number`
- **Body**: `VerdictBatchSchema` (array, `minItems: 1`)
- **Response 200**: `{ message: string }`
- **Response 400**: validation failures (empty batch, duplicates, missing fields)
- **Response 403**: any entry targets out-of-scope category
- **Response 404**: cover not found / evaluator not found

---

### TypeBox Schema Design (`src/schema/evaluator-review.ts`)

```ts
// Answer view (response)
AnswerViewItemSchema = t.Object({
  answerId: t.Number(),
  questionId: t.Number(),
  category: t.String(),
  status: t.String(),
  selectedChoice: t.String(),
  latestVerdictChoice: t.Nullable(t.String()),
  latestDescription: t.Nullable(t.String()),
})
AnswerViewSchema = t.Array(AnswerViewItemSchema)

// Verdict batch entries — discriminated union on `decision`
ApproveEntrySchema = t.Object({
  answerId: t.Number(),
  decision: t.Literal("approve"),
})
ChangeScoreEntrySchema = t.Object({
  answerId: t.Number(),
  decision: t.Literal("change_score"),
  verdictChoice: t.Union([t.Literal("0"), t.Literal("1"), t.Literal("2"), t.Literal("3")]),
  description: t.String({ minLength: 1 }),
})
RejectEntrySchema = t.Object({
  answerId: t.Number(),
  decision: t.Literal("reject"),
  description: t.String({ minLength: 1 }),
})
VerdictEntrySchema = t.Union([ApproveEntrySchema, ChangeScoreEntrySchema, RejectEntrySchema])
VerdictBatchSchema = t.Array(VerdictEntrySchema, { minItems: 1 })
```

> **Note**: TypeBox `t.Union` on `decision` discriminant handles structural validation (change_score without verdictChoice → 400 at Elysia layer before service is called). Additional cross-field validation (duplicate answerIds) done in service.

---

### Service Design (`src/service/evaluator-review.ts`)

```ts
export const createEvaluatorReviewService = (database: typeof db) => ({
  getAnswers(coverId, callerId) → AnswerViewItem[] | ElysiaCustomStatusResponse,
  verdict(coverId, callerId, batch) → { message } | ElysiaCustomStatusResponse,
})
export const evaluatorReviewService = createEvaluatorReviewService(db)
```

#### `getAnswers(coverId, callerId)`

```text
1. getEvaluatorData(callerId)           → {evaluator} or status(404)
2. assertCoverInRegion(coverId, region) → cover row or status(404)
3. query answers:
   SELECT answers.id, questions.id, questions.category,
          latestLog.status, answers.selectedChoice,
          latestLog.verdictChoice, latestLog.description
   FROM answers
   JOIN questions ON questions.id = answers.questionId
     AND questions.category = ANY(categoriesFor(level))  ← hard filter
   LEFT JOIN LATERAL (
     SELECT status, verdictChoice, description
     FROM answerLogs WHERE answerId = answers.id
     ORDER BY id DESC LIMIT 1
   ) latestLog ON true
   WHERE answers.coverId = coverId
4. map rows → AnswerViewItem[]
```

Drizzle approach: `selectDistinctOn([answerLogs.answerId])` ordered by `answerLogs.answerId, desc(answerLogs.id)` left-joined to answers — same pattern used in `answer.ts:submit`.

#### `verdict(coverId, callerId, batch)`

```text
1. getEvaluatorData(callerId)                     → {evaluator} or status(404)
2. assertCoverInRegion(coverId, region)            → or status(404)
3. duplicate answerId check                        → status(400) if any
4. fetch {answerId, category} for all batch answerIds
   + verify all belong to coverId                  → status(400) if mismatch
5. scope check: all categories ∈ categoriesFor(level) → status(403) if any out-of-scope
6. fetch latest status per answerId
7. actionability check per entry:
   - finished     → status(400) "answer is already finalized"
   - recommended  → only ODPC may act → status(403) for tier-1
8. resolve outcome status per entry:
   approve + ODPC        → "finished"
   approve + tier-1      → "recommended"
   change_score | reject → "rejected"
9. transaction: answerLogs.insert({ answerId, status, verdictChoice?, description, eval_id })
   for each entry in batch
10. return status(200, { message: "verdict submitted" })
```

---

### Region Scope Helper

Reusable across `getAnswers` and `verdict`:

```ts
const assertCoverInRegion = async (coverId, region) => {
  const row = await db.select(...)
    .from(covers)
    .innerJoin(enrolls, eq(enrolls.id, covers.enrollId))
    .innerJoin(factories, eq(factories.accountId, enrolls.factoryId))
    .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
    .where(and(eq(covers.id, coverId), eq(provinces.healthRegion, region)))
    .limit(1)
    .then(r => r[0])
  if (!row) return status(404, { message: "cover not found" })
  return row
}
```

---

### Outcome Logic

```ts
const resolveOutcomeStatus = (level: EvaluatorLevel, decision: string): AnswerStatus => {
  if (decision === "approve") return level === "ODPC" ? "finished" : "recommended"
  return "rejected"  // change_score or reject both → rejected
}
```

---

### Actionability Rule

| Current status | Tier-1 can act? | ODPC can act? |
|----------------|-----------------|---------------|
| `in_review`    | ✅              | ✅            |
| `recommended`  | ❌ → 403        | ✅ (override) |
| `rejected`     | ✅              | ✅            |
| `finished`     | ❌ → 400        | ❌ → 400      |

---

### Data Model

No new tables or columns. Reads `answers`, `questions`, `answerLogs`. Writes new rows to `answerLogs` (using the `verdictChoice` column and `recommended`/`finished`/`rejected` status values added in bolt 006).

---

### Files to Create/Change

| File | Action |
|------|--------|
| `src/service/evaluator-review.ts` | Create — `createEvaluatorReviewService` + singleton |
| `src/schema/evaluator-review.ts` | Create — `AnswerViewItemSchema`, `VerdictBatchSchema` etc. |
| `src/routes/evaluators/covers/[coverId]/answers/index.ts` | Create — GET endpoint |
| `src/routes/evaluators/covers/[coverId]/verdict/index.ts` | Create — POST endpoint |
