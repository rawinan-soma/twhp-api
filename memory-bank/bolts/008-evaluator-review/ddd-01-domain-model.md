---
stage: domain-model
bolt: 008-evaluator-review
created: 2026-06-17T03:57:48Z
---

## Static Model: Evaluator Review — ODPC Finalize + File Deletion (008-evaluator-review)

> Scope: ODPC-only finalize engine — override/backstop, cover transition, hard-reject file deletion.
> Stories: 005-finalize-and-transition, 006-file-deletion-on-reject.

---

### Entities

- **FinalizeContext**: A snapshot of every answer in a Cover at ODPC commit time.
  - Properties: `answerId`, `currentStatus`, `currentVerdictChoice?`, `fileUrls: string[]`
  - Business Rules:
    - Derived from latest `answerLogs` row per answer.
    - Used to compute the effective final state after ODPC's explicit batch + backstop.

- **BackstopEntry**: A synthetic verdict applied to un-overridden `recommended` answers.
  - Properties: `answerId`, `status: "finished"`, `eval_id`
  - Business Rules:
    - Generated for every `recommended` answer NOT explicitly included in ODPC's batch.
    - No `verdictChoice` or `description` — pure approval conversion.

---

### Value Objects

- **FinalizeDecision** — the outcome for a single answer after ODPC commit:

  | Source | Final status |
  |--------|-------------|
  | In batch, `approve` | `finished` |
  | In batch, `change_score` | `rejected` (verdictChoice set) |
  | In batch, `reject` | `rejected` (verdictChoice null) |
  | NOT in batch, currently `recommended` | `finished` (backstop) |
  | NOT in batch, currently `rejected` | `rejected` (unchanged) |
  | NOT in batch, currently `finished` | `finished` (unchanged) |
  | NOT in batch, currently `in_review` | ⛔ finalize gate FAILS |

- **FinalizeGate** — validity predicate before transaction opens:
  - **Valid**: zero answers with effective final status `in_review`
  - **Invalid → `400`**: ≥1 answer still `in_review` after batch + backstop

- **HardRejectRule** — determines which answers have MinIO files deleted:
  - **Hard-reject**: final status = `rejected` AND latest `verdictChoice` = null
    - ODPC explicit `reject` entries (new log, verdictChoice null)
    - Prior tier-1 rejects not overridden by ODPC (existing log, verdictChoice null)
  - **Preserve files**: final status = `rejected` AND `verdictChoice` ≠ null (change-score)

- **CoverTransition** — derived from final answer statuses:
  - All answers `finished` → Cover → `finished`
  - ≥1 answer `rejected` → Cover → `in_progress` (factory must re-answer)

---

### Aggregates

- **FinalizeBatch** (aggregate root for ODPC commit):
  - Members: ODPC's explicit `VerdictBatch`, `BackstopEntry[]`, `FinalizeContext` (whole Cover)
  - Invariants:
    - FinalizeGate must hold before transaction opens.
    - File I/O executes before transaction (project invariant).
    - All writes (answerLogs × N + backstop × M + answers file-clear × K + coverLogs × 1) are one transaction.

---

### Domain Events

- **CoverFinalized**:
  - Trigger: ODPC commit where all answers resolve to `finished`.
  - Payload: `{ coverId, newCoverStatus: "finished", evaluatorId }`
  - Note: grade computation + email (bolt 009/010) are separate events triggered by this.

- **CoverSentBack**:
  - Trigger: ODPC commit where ≥1 answer is `rejected`.
  - Payload: `{ coverId, newCoverStatus: "in_progress", evaluatorId }`

---

### Domain Services

- **FinalizeService** (extension of `evaluatorReviewService.verdict`):
  - Additional operations (ODPC path only):
    - `computeEffectiveState(allAnswers, batch) → FinalizeDecision[]`
    - `buildBackstopEntries(decisions, evalId) → BackstopEntry[]`
    - `collectHardRejectFiles(decisions, allAnswers) → string[]`
    - `deleteHardRejectFiles(fileUrls) → void` (calls `utilities().deleteFile`, outside txn)
    - `computeCoverTransition(decisions) → "finished" | "in_progress"`

---

### Ubiquitous Language

| Term | Definition |
|------|-----------|
| backstop | Auto-conversion of un-overridden `recommended` answers to `finished` at ODPC commit. |
| finalize gate | Pre-transaction check that no `in_review` answers remain after batch + backstop. |
| hard-reject | A `rejected` answer with no `verdictChoice` — files must be deleted at ODPC commit. |
| change-score reject | A `rejected` answer with `verdictChoice` set — files are preserved. |
| cover transition | Writing a `coverLogs` row that records whether the Cover is `finished` or `in_progress`. |
| single-shot | ODPC's commit always finalizes — no partial/draft mode for ODPC. |
