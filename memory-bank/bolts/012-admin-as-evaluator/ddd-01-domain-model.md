---
stage: model
bolt: 012-admin-as-evaluator
created: 2026-06-19T02:01:44Z
---

## Static Model: admin-as-evaluator (admin verdict → ODPC finalize)

Scope of THIS bolt: story `003-admin-verdict-endpoint`. The reviewer seam, `ReviewerContext`,
and `verdict(coverId, reviewer, batch)` were already generalized in bolt 011. This bolt adds
the **presentation entry** that drives the existing ODPC commit branch as a national admin.
The domain model is the same as bolt 011's; only the write-side aggregate behaviour matters
here, restated for clarity.

### Entities

- **Reviewer** (admin instance): `{ accountId, level: ODPC, region: null }` — the national
  finalizer. Identical authority to a regional ODPC (no superset).
- **Cover** (aggregate root, existing): the admin commit transitions it (`finished` /
  `in_progress`) — the only write in this bolt.
- **Answer / AnswerLog** (existing): the admin verdict appends `answerLogs` rows; `finished`
  answers are immutable to the admin too.
- **CoverLog** (existing): one transition row per admin commit, `evaluator_id` = admin `accountId`.

### Value Objects

- **VerdictEntry** (existing `VerdictBatchSchema`): `approve | change_score | reject`
  (+ `verdictChoice` / `description`). Unchanged.
- **Outcome→Status** (existing ODPC rules): admin (ODPC) `approve → finished`;
  `change_score → rejected` + `verdict_choice` (files preserved); `reject → rejected`
  (files deleted at commit).
- **Grade** (existing): computed on transition to `finished` (4-tier top-down floors).

### Aggregates

- **Cover commit** (existing ODPC invariant set): atomic batch — all `answerLogs` rows +
  the `coverLogs` transition in one transaction; backstop of un-overridden `recommended`;
  finalize gate (no `in_review`/`recommended` may remain); hard-reject MinIO deletes run
  **before** the txn. Admin reuses this verbatim.

### Domain Events

- **CoverFinalized** (existing): admin commit → `finished` ⇒ verdict-result-finished email (+Grade).
- **CoverReturned** (existing): admin commit with any reject → `in_progress` ⇒ verdict-result-in-progress email.
  No new event types; admin commit triggers the same two as a regional ODPC commit.

### Domain Services

- **AdminFinalize** = the existing `verdict()` ODPC branch invoked with an admin
  `ReviewerContext`. No new service logic; the admin route synthesizes the context and calls it.

### Repository Interfaces

- Reuses existing writes: `answerLogs` insert, `answers` file-url nulling on hard reject,
  `coverLogs` transition insert; reuses `emailQueue.add`. No new repository.

### Ubiquitous Language

- **Admin commit**: a DOED admin's single-shot finalizing verdict batch — semantically an
  ODPC commit performed nationally.
- **Audit identity**: the admin's `accountId`, written to `answerLogs.evaluation_id` and
  `coverLogs.evaluator_id` (indistinguishable from an ODPC evaluator, per ADR-3 / PO decision).

### Story coverage

- **003-admin-verdict-endpoint**: AdminFinalize via `POST /admin/covers/:coverId/verdict`
  (adminGuard) → existing ODPC commit, with admin audit + Grade/email parity.
