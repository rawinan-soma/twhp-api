---
unit: 001-per-answer-verdict-save
bolt: 019-per-answer-verdict-save
stage: design
status: complete
updated: 2026-07-02T07:24:41Z
---

# Technical Design - Per-Answer Verdict Save (write path)

## Architecture Pattern

**Existing layered monolith, unchanged** — ElysiaJS route → singleton service (factory-function `createEvaluatorReviewService(db)`) → Drizzle. This bolt is a **refactor within the existing `evaluator-review` service**: split the current `verdict()` batch method into a single-Answer `saveAnswerVerdict()` (this bolt) and a `finalize()` (bolt 020). No new architectural pattern, no new module, no schema change. Services **return** `status(code, body)` — never throw (coding-standards).

## Layer Structure

```text
┌─────────────────────────────┐
│      Presentation           │  Routes — DEFERRED to bolt 021
├─────────────────────────────┤   (schema/evaluator-review.ts DTOs land here in bolt 019)
│      Application/Domain      │  evaluator-review.ts: saveAnswerVerdict()
│                             │  + EditPermissionPolicy + CategoryScopePolicy (reuse categoriesFor)
├─────────────────────────────┤
│     Infrastructure          │  Drizzle: answers/answerLogs/questions/covers reads + answerLogs insert
└─────────────────────────────┘
```

## Component Design (bolt scope)

### Story 001 — DTO refactor (`src/schema/evaluator-review.ts`)
- Keep `ApproveEntrySchema` / `ChangeScoreEntrySchema` / `RejectEntrySchema` and their union `VerdictEntrySchema`.
- **Remove** `VerdictBatchSchema` and the `VerdictBatch` type (and every import of them).
- `VerdictEntrySchema` becomes the **request body** of the save endpoint (single object, not an array); `answerId` is **not** in the body.
- **Add** `FinalizeSchema = t.Object({})` (empty body) — exported for bolt 020/021.
- `AnswerViewItemSchema` / `AnswerViewSchema` unchanged.

### Story 002 — `saveAnswerVerdict` (service)
Signature (conceptual):
```
saveAnswerVerdict(coverId: number, answerId: number, reviewer: ReviewerContext, entry: VerdictEntry)
  → status(200, { answerId, status }) | status(400|403|404, { message })
```
Reuses existing helpers: `helper.assertCoverAccess(coverId, region)`, `categoriesFor(level)`. Fetch the single Answer (`category`, `selectedChoice`) joined `answers×questions` filtered by `coverId`+`answerId`; fetch the latest log via `selectDistinctOn([answerLogs.answerId], {status, eval_id})` for the one id. Compute `VerdictOutcome`, insert one `answerLogs` row. **No transaction needed** (single insert), **no** file I/O / `coverLogs` / email.

### Story 003 — `EditPermissionPolicy` (pure, inside service)
```
canWrite(latestStatus, latestAuthorId, reviewer):
  finished              → deny 400 "answer is finalized; immutable"
  recommended           → (reviewer.level === "ODPC" || latestAuthorId === reviewer.accountId)
                            ? allow : deny 403 "recommended; only its author or ODPC may edit"
  rejected | in_review  → allow
  (no log yet ⇒ treat as in_review)
```
Replaces the current blanket `currentStatus === "recommended" && level !== "ODPC" → 403`.

## API Design

| Endpoint | Method | Request | Response | Bolt |
|----------|--------|---------|----------|------|
| `saveAnswerVerdict` (service method) | — | `(coverId, answerId, reviewer, VerdictEntry)` | `{ answerId, status }` or `status(4xx,{message})` | **019** |
| `POST …/covers/:coverId/answers/:answerId/verdict` | POST | `VerdictEntrySchema` body | `200 {answerId,status}` / `400/403/404 {message}` | 021 (wiring) |
| `POST …/covers/:coverId/finalize` | POST | `FinalizeSchema` (empty) | — | 020/021 |

_This bolt delivers the service method + DTOs; the HTTP route that calls it is wired in bolt 021._

## Data Persistence

| Table | Columns written | Notes |
|-------|-----------------|-------|
| `AnswerLogs` | `answer_id`, `status`, `verdict_choice`, `description`, `evaluation_id` (`eval_id`), `updated_at` (default) | **One INSERT per save.** Append-only; latest `id` = current state. **No schema change** — `answerStatus` enum and all columns unchanged. |
| `Answers` | (read only) `id`, `cover_id`, `question_id`, `selected_choice` | Read for belongs-to-cover + live-choice no-op check. Never mutated here (files/selectedChoice untouched). |
| `AnswerLogs` | (read) latest row per `answer_id` | `selectDistinctOn` ordered by `id desc` → `{status, eval_id}` for the guard. |

## Security Design

| Concern | Approach |
|---------|----------|
| Authentication | Unchanged — caller identity via `evalGuard`/admin guard + resolved `ReviewerContext` (bolt 021 wires; service trusts the passed context). |
| Authorization (cover) | `assertCoverAccess(coverId, region)` — region-scoped for evaluators, existence-only for national ODPC (`region: null`). |
| Authorization (category) | Hard server-side scope: Answer category ∈ `categoriesFor(reviewer.level)` else `403`. |
| Authorization (edit) | `EditPermissionPolicy` keyed on latest status + author `eval_id`; `finished` immutable to all, `recommended` author/ODPC-only. |
| Data integrity | Append-only log; `selectedChoice` never overwritten; `finished` never written by a save. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| Durability | Each save is its own committed INSERT — a verdict persists the instant it is made; interrupted reviews lose nothing. |
| Resumability | Current state derives from latest logs; a partially reviewed Cover simply has some Answers `in_review` (read via unchanged `getAnswers`). |
| Auditability | `eval_id` on every log row; append-only history reconstructs who wrote what, when. |
| Concurrency | No new concurrent writers; single INSERT; latest-id-wins. Single-finalizer invariant untouched (finalize is bolt 020). |

## Error Handling

| Error Type | Code | Response |
|------------|------|----------|
| Cover not accessible / not found | 404 | `{ message: "cover not found" }` |
| Answer not in this cover | 400 | `{ message: "answer not found in this cover" }` |
| Category out of scope | 403 | `{ message: "answer is outside your category scope" }` |
| `finished` edit attempt | 400 | `{ message: "answer ${id} is already finalized" }` |
| `recommended` edit by non-author non-ODPC | 403 | `{ message: "answer ${id} is recommended; only its author or ODPC can override" }` |
| No-op change_score (== live choice) | 400 | `{ message: "change_score must differ from the current choice" }` |
| Body validation (missing verdictChoice/description) | 400 | TypeBox VALIDATION → global handler |

## External Dependencies

| Service | Purpose | Integration |
|---------|---------|-------------|
| PostgreSQL (Drizzle) | Read Answer/latest log; append one AnswerLog | SQL (single INSERT; no txn needed) |
| _MinIO / BullMQ / SMTP_ | **Not used in this bolt** | Deferred to finalize (bolt 020) |

## Testing Approach (executed in Stage 5)

Integration tests against the service (per project pattern; no unit-test framework yet). Cases derived from story ACs: approve→recommended for tier-1 **and** ODPC; change_score/reject shapes; no-op change_score 400; out-of-scope 403; edit guard (finished 400, recommended author/ODPC allow + non-author 403, factory-accept protection, tier-1 edits own while in_review); zero side effects (no coverLogs/MinIO/email).
