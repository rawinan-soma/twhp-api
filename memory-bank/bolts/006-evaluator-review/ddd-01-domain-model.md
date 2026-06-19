---
stage: domain-model
bolt: 006-evaluator-review
created: 2026-06-17T00:00:00Z
---

## Static Model: Evaluator Review — Foundation (006-evaluator-review)

> Scope: schema additions (`verdict_choice`, `recommended`, `grade`) + server-side level→category access map.
> Stories: 001-schema-changes, 002-level-category-access.

---

### Entities

- **Answer**: A factory's response to a survey question within a Cover.
  - Properties: `id`, `coverId`, `questionId`, `category`, `selectedChoice` (factory's pick), `status: AnswerStatus`, `fileUrl?`
  - Business Rules:
    - Status begins as `in_review` when a Cover is submitted for evaluation.
    - Once `finished`, status is immutable — no evaluator can alter it.
    - `rejected` answers can be re-answered by the factory (→ back to `in_review`).

- **AnswerLog**: An evaluator's recorded verdict action against one Answer.
  - Properties: `id`, `answerId`, `evaluatorId`, `verdictChoice?: VerdictChoice`, `description?`, `createdAt`
  - Business Rules:
    - `verdictChoice` is nullable — description-only verdicts are valid (e.g., change-score with no new choice yet).
    - `verdictChoice` is always in `{0, 1, 2, 3}`; the value `n/a` is never written here.
    - Multiple logs may exist per Answer (audit trail); only the latest is authoritative.

- **Cover**: A factory's full submission for a fiscal-year enrollment cycle.
  - Properties: `id`, `enrollId`, `status: CoverStatus`, `submittedAt?`
  - Business Rules:
    - A Cover transitions to `finished` when ODPC finalizes (no `in_review` or `recommended` answers remain).
    - A Cover transitions back to `in_progress` when ODPC sends back for revision.

- **Evaluator**: A staff account authorized to perform reviews.
  - Properties: `id`, `accountId`, `level: EvaluatorLevel`, `region: string`
  - Business Rules:
    - `level` determines which categories the evaluator may access (see CategoryOwnership).
    - `region` scopes which Covers are visible to this evaluator.
    - An account not present in the evaluators table is not an evaluator (→ 404).

---

### Value Objects

- **AnswerStatus** (4-state enum — replaces the previous 3-state enum):
  - `in_review`: answer awaiting verdict; mutable by evaluators with access
  - `recommended`: tier-1 provisional approval (DOH or Mental); ODPC may still override
  - `rejected`: evaluator rejected; factory must re-answer
  - `finished`: ODPC final approval; immutable

  > **State machine invariant**: only `recommended` allows tier-1 approval without finalization.
  > `finished` is the only terminal state that blocks further edits.

- **VerdictChoice** (constrained to choices enum `{0,1,2,3}`):
  - `0` = poorest, `3` = best; same scale as factory `selectedChoice`
  - Value `n/a` is never written to `answerLogs.verdict_choice`; app-layer validation enforces this.

- **EvaluatorLevel** (enum):
  - `Mental` | `DOH` | `ODPC`

- **CategorySet** (typed set of category names):
  - Immutable once defined; owned by CategoryOwnership constant.

- **Grade** (computed, not persisted as a column):
  - `gold | silver | certificate | joined`
  - Present on Score Report response only after a Cover reaches `finished`.
  - Computed from live verdict scores at finalization time.

---

### Aggregates

- **Answer** (aggregate root for the review state machine):
  - Members: `AnswerLog[]` (verdict history), `fileUrl?`
  - Invariants:
    - A `finished` answer cannot have new logs added.
    - `verdictChoice` in `AnswerLog` is always from `{0,1,2,3}`.
    - Status transition `recommended → finished` requires ODPC-level caller.

- **Cover** (aggregate root for finalization):
  - Members: `Answer[]`, `grade?`
  - Invariants:
    - Finalization gate: zero `in_review` or `recommended` answers.
    - `grade` is null until Cover reaches `finished`.
    - Back-to-revision gate: at least one `rejected` answer present.

---

### Domain Events

- **VerdictRecorded**:
  - Trigger: evaluator calls the batch verdict endpoint for answers they own.
  - Payload: `{ coverId, evaluatorId, level, outcomes: [{answerId, action, verdictChoice?, description?}] }`

- **CoverFinalized**:
  - Trigger: ODPC commits the last verdict with no `in_review`/`recommended` left.
  - Payload: `{ coverId, grade, enrollId, factoryEmail }`
  - Side effects: email job enqueued, `finished` Cover status set, hard-rejected files deleted from MinIO.

- **CoverSentBack**:
  - Trigger: ODPC commits with at least one `rejected` answer.
  - Payload: `{ coverId, enrollId, factoryEmail }`
  - Side effects: email job enqueued, Cover set back to `in_progress`.

---

### Domain Services

- **CategoryOwnershipService** (pure constant + helper):
  - Operations: `categoriesFor(level: EvaluatorLevel): CategorySet`
  - Ownership map (canonical — sourced from CONTEXT.md):
    - `Mental  → { Mental }`
    - `DOH    → { Disease, Safety }`
    - `ODPC   → { Collaborate, Disease, Safety, Mental, Outcome }` (all 5)
  - Dependencies: none (pure constant)

- **EvaluatorAccessService** (wraps existing `getEvaluatorData` helper):
  - Operations:
    1. `resolveEvaluator(accountId) → { evaluator, level, region } | 404`
    2. `assertRegionScope(evaluator, cover) → void | 403/404`
    3. `filterAnswersByLevel(answers, level) → Answer[]` (hard-filter by `categoriesFor(level)`)
  - Dependencies: `evaluators` table, `covers` table, `enrolls` table, `CategoryOwnershipService`

---

### Repository Interfaces

- **AnswerRepository**:
  - Entity: `Answer`
  - Methods:
    - `findByCoverAndLevel(coverId, level): Answer[]` — region-scoped, category-filtered
    - `findByCoverId(coverId): Answer[]` — all answers (for finalization gate)
    - `updateStatus(answerId, status: AnswerStatus): void`
    - `appendLog(log: AnswerLog): void`

- **EvaluatorRepository**:
  - Entity: `Evaluator`
  - Methods:
    - `findByAccountId(accountId): Evaluator | null`

- **CoverRepository**:
  - Entity: `Cover`
  - Methods:
    - `findById(coverId): Cover | null`
    - `updateStatus(coverId, status: CoverStatus): void`

---

### Ubiquitous Language

| Term | Definition |
|------|-----------|
| `verdict_choice` | The score (0–3) an evaluator assigns during review; mirrors the factory's `selectedChoice` scale. Never `n/a`. |
| `answerStatus` | The four-state lifecycle of a reviewed answer: `in_review → recommended/rejected → finished`. |
| `recommended` | Provisional tier-1 approval (DOH or Mental). ODPC can override without the factory's involvement. |
| `finished` | ODPC's final, irrevocable approval for a single answer. |
| `finalize` | ODPC's act of committing a batch verdict when no `in_review` or `recommended` answers remain. |
| `send-back` | ODPC's act of committing when at least one answer is `rejected`, returning the Cover to the factory. |
| `level` | An evaluator's tier (Mental / DOH / ODPC) that governs which categories they may review. |
| `region` | The geographic scope that limits which Covers an evaluator can see. |
| `categoriesFor(level)` | The owned category set for a given evaluator level — enforced identically on read and write. |
| `grade` | A computed 4-tier rating (`gold / silver / certificate / joined`) attached to a Cover after finalization. |
| `tier-1 evaluator` | Mental or DOH-level evaluator; can approve (→ `recommended`) but cannot finalize. |
| `ODPC` | The highest-level evaluator; can override any non-`finished` answer and is the sole finalizer. |
| `change-score` | Verdict outcome where the evaluator records a different `verdict_choice` than the factory's `selectedChoice`. |
