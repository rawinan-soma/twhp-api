---
stage: domain-model
bolt: 007-evaluator-review
created: 2026-06-17T03:45:43Z
---

## Static Model: Evaluator Review — Answers List + Verdict Batch (007-evaluator-review)

> Scope: `GET /evaluators/covers/:coverId/answers` (level-filtered read) + `POST /evaluators/covers/:coverId/verdict` (atomic batch write). Finalize/transition/file-deletion deferred to bolt 008.
> Stories: 003-answers-list-endpoint, 004-verdict-batch-endpoint.

---

### Entities

- **AnswerView**: A read projection of a single answer as seen by an evaluator.
  - Properties: `answerId`, `questionId`, `category`, `status: AnswerStatus`, `selectedChoice` (factory's pick), `latestVerdictChoice?: VerdictChoice`, `latestDescription?: string`
  - Business Rules:
    - Only answers whose `question.category` is in `categoriesFor(callerLevel)` are returned.
    - Latest verdict = newest `answerLogs` row for that answer (event-sourced; null if no log yet).
    - All statuses (`in_review`, `recommended`, `rejected`, `finished`) are returned — the list is read-only.

- **VerdictBatchEntry**: One evaluator's decision on one answer.
  - Properties: `answerId`, `decision: Decision`, `verdictChoice?: VerdictChoice`, `description?: string`
  - Business Rules:
    - `decision = approve`: no `verdictChoice` or `description` required.
    - `decision = change_score`: `verdictChoice` ∈ `{0,1,2,3}` required + non-empty `description` required.
    - `decision = reject`: non-empty `description` required; no `verdictChoice`.
    - Duplicate `answerId` within a batch → `400`.
    - Empty batch → `400`.

- **VerdictBatch**: The full set of entries submitted in one POST.
  - Properties: `coverId`, `callerId`, `entries: VerdictBatchEntry[]`
  - Business Rules:
    - If ANY entry targets an answer outside `categoriesFor(callerLevel)` → whole batch `403` (no partial apply).
    - All `answerLogs` writes happen in one transaction.
    - `eval_id` is set on every written log row.

---

### Value Objects

- **Decision** (discriminated union — 3 variants):
  - `approve` — no payload; outcome depends on caller level
  - `change_score` — requires `verdictChoice: VerdictChoice` + `description: string`
  - `reject` — requires `description: string`

- **OutcomeStatus** (resulting `answerStatus` written to the log):

  | Caller level | Decision     | Resulting status  |
  |--------------|--------------|-------------------|
  | Mental / DOH | `approve`    | `recommended`     |
  | ODPC         | `approve`    | `finished`        |
  | Any          | `change_score` | `rejected`      |
  | Any          | `reject`     | `rejected`        |

  > **Note**: ODPC `approve` → `finished` only for non-finalized answers. Full finalize/transition gate (no `in_review`/`recommended` left) is enforced in bolt 008.

- **ActionabilityRule**: Which statuses an evaluator may act on.
  - `in_review` → actionable by anyone with category access
  - `recommended` → actionable by ODPC only (override)
  - `rejected` → actionable by anyone with category access (re-verdict)
  - `finished` → not actionable (immutable)

  > ODPC can act on `in_review`, `recommended`, `rejected`. Tier-1 can act on `in_review` and `rejected` only.

---

### Aggregates

- **VerdictBatch** (aggregate root for the write):
  - Invariants:
    - Scope check (`categoriesFor`) evaluated before opening transaction.
    - All entries validated before any write begins (fail-fast on first violation).
    - Single transaction wraps all `answerLogs` inserts.

---

### Domain Events

- **VerdictBatchCommitted**:
  - Trigger: all entries pass validation and are written atomically.
  - Payload: `{ coverId, evaluatorId, outcomes: [{answerId, status}] }`
  - Note: does NOT trigger finalize/email — that is bolt 008.

---

### Domain Services

- **EvaluatorReviewService** (new service, factory pattern):
  - `getAnswers(coverId, callerId) → AnswerView[]`
    1. Resolve evaluator (`getEvaluatorData`) → level + region
    2. Assert Cover belongs to caller's region
    3. Query answers joined to questions, filter `category IN categoriesFor(level)`
    4. Left-join latest `answerLogs` per answer
  - `verdict(coverId, callerId, batch: VerdictBatchEntry[]) → void | error`
    1. Resolve evaluator → level + region
    2. Assert Cover in region
    3. Fetch answer + question.category for each `answerId`
    4. Scope check: all categories ∈ `categoriesFor(level)` else `403`
    5. Validate each entry per `Decision` rules
    6. Actionability check: each answer's latest status allows action by this level
    7. In one transaction: insert `answerLogs` for all entries

---

### Repository Interfaces

- **EvaluatorReviewRepository**:
  - `findAnswersForCover(coverId, categories: string[]) → AnswerView[]`
    - Joins: `answers` → `questions` (category filter) → latest `answerLogs` (left join, selectDistinctOn answerId ordered by id desc)
  - `findAnswerCategories(answerIds: number[]) → { answerId, category }[]`
    - Used for scope check before transaction
  - `findLatestStatuses(answerIds: number[]) → { answerId, status }[]`
    - Used for actionability check
  - `insertVerdictLogs(entries, evalId) → void` (inside transaction)

---

### Ubiquitous Language

| Term | Definition |
|------|-----------|
| `approve` | Decision variant meaning "I accept this answer as-is." Status outcome depends on caller level. |
| `change_score` | Decision variant where the evaluator proposes a different score than the factory's. Requires `verdictChoice` + `description`. |
| `reject` | Decision variant meaning the factory must re-do this answer. Requires `description`. |
| `recommended` | Status written when a tier-1 evaluator approves. ODPC can still override. |
| `finished` | Status written when ODPC approves. Immutable. |
| `whole-batch 403` | Any out-of-scope entry causes the entire POST to fail — no partial writes. |
| `actionable` | An answer whose current status permits a new verdict from this caller level. |
| `eval_id` | The evaluator's accountId, recorded on every `answerLogs` row they write. |
| `scope check` | Pre-transaction assertion that all batch entries fall within `categoriesFor(level)`. |
