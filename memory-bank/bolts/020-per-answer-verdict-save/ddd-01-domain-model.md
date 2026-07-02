---
unit: 001-per-answer-verdict-save
bolt: 020-per-answer-verdict-save
stage: model
status: complete
updated: 2026-07-02T08:17:17Z
---

# Static Model - ODPC Finalize (whole-Cover resolution)

## Bounded Context

The **Evaluator Review** context, **finalize side** — the complement of bolt 019's per-Answer write side. This bolt models ODPC's single, atomic, whole-Cover resolution: reading the **persisted** latest `answerLogs`, hard-gating on any unresolved `in_review`, converting un-overridden `recommended → finished`, deleting hard-reject evidence files, writing the one `coverLogs` transition, computing the Grade, and notifying the Factory.

The defining rule of this context is that the whole-Cover outcome is a **pure function of the persisted logs** — the old in-flight batch merge (`batchDecisionMap` / `effectiveState`) is **removed**. There is no client-held verdict set to reconcile; every input to finalize is already durably stored by prior saves (bolt 019). Finalize invents no verdict.

Scope = story **004-odpc-finalize-action** only. Route/transport wiring and the admin-surface mirror are bolt 021; grade/email **content** and templates are unchanged from bolt 010 (`003`).

## Domain Entities

| Entity | Properties | Business Rules |
| ------ | ---------- | -------------- |
| **Cover** | `id`, `enrollId`, current status (derived from latest `CoverLog`) | The finalize aggregate root. Accessible region-scoped for evaluators, existence-only for a national reviewer. Only finalize transitions it. Its status is never stored on the row — it is the latest `CoverLog`. |
| **Answer** | `id`, `coverId`, `questionId` (→ `category`), `selectedChoice`, `fileUrl` (evidence filename \| null) | Read-only here. Its **current status** is the latest `AnswerLog`. `fileUrl` is the MinIO filename subject to deferred deletion. Never mutated by finalize (only a promotion log is appended for it). |
| **AnswerLog** | `id` (serial, ordering), `answerId`, `status` (AnswerStatus), `verdictChoice` (`0–3` \| null), `description`, `evalId` (author) | Append-only. Latest `id` per `answerId` = authoritative current state — finalize's sole input per Answer. Finalize **appends** one `finished` row per un-overridden `recommended` (the only place `finished` is written). |
| **CoverLog** | `id`, `coverId`, `status` (CoverStatus), `evaluatorId` (finalizer), `createdAt` | Append-only Cover-transition history. Finalize writes **exactly one** row per successful commit: `finished` or `in_progress`. |
| **Enroll** | `id`, `email` (Factory contact) | Read-only. Supplies the recipient for the single post-finalize Factory email (`enrolls.email`). |

## Value Objects

| Value Object | Properties | Constraints |
| ------------ | ---------- | ----------- |
| **FinalizeBody** | (empty `{}`) | The finalize request carries no payload; the Cover identity is the path. (Schema `FinalizeSchema` defined in bolt 019.) |
| **ReviewerContext** | `accountId`, `level` (`Mental`\|`DOH`\|`ODPC`), `region` (number \| null) | Finalize requires `level === "ODPC"` (native ODPC or DOED-admin-as-national-ODPC, `region: null`). `Mental`/`DOH` (tier-1) → `403`. `evaluatorId` on the `CoverLog` = `accountId`. |
| **AnswerStatus** | `in_review` \| `recommended` \| `rejected` \| `finished` | Enum unchanged (4 values). At finalize: `in_review` ⇒ gate fail; `recommended` ⇒ promote to `finished`; `rejected` ⇒ (see RejectKind); `finished` ⇒ already terminal (idempotent, retained). |
| **RejectKind** | derived from a `rejected` log's `verdictChoice` | **Hard reject** ⇔ `verdictChoice === null` (a `reject`) → file **deleted**. **Score change** ⇔ `verdictChoice ∈ {0,1,2,3}` (a `change_score`) → file **retained** (Factory must see the proposed correction). |
| **FinalizeValidity** | predicate over the resolved latest statuses | **Valid** ⇔ no Answer's latest status is `in_review`. An invalid finalize is rejected `400` before any side effect; finalize never auto-verdicts a leftover `in_review`. |
| **CoverOutcome** | one of `finished` \| `in_progress` | `finished` ⇔ **every** Answer resolves to `finished` (none `rejected`). `in_progress` ⇔ **≥1** Answer is `rejected` (revision needed). Determines the single `CoverLog` status and whether a Grade is emitted. |
| **HardRejectDeleteSet** | set of `Answer.fileUrl` | The evidence files to delete = every Answer whose **final persisted** status is a **hard reject** (`rejected` + `verdictChoice === null`) and has a non-null `fileUrl`. Computed once from the persisted snapshot; deleted **before** the txn. |
| **Grade** | computed score breakdown → letter/tier Grade | Computed on-demand via `calculateBreakdown` + `computeGrade`; **never persisted** (ADR-0001). Present in the response **only** on the `finished` outcome. |

## Aggregates

| Aggregate Root | Members | Invariants |
| -------------- | ------- | ---------- |
| **Cover** (finalization) | the `Cover` row + every child `Answer`'s latest `AnswerLog` + the `CoverLog` stream | (1) **Finalize is the sole writer of `finished`** (Answer status) *and* the sole writer of a `CoverLog` transition — FR-5. (2) Finalize is **valid only if no Answer is `in_review`** (hard-gate; no invented verdicts). (3) The outcome is a **pure function of the persisted latest logs** — no `effectiveState`/batch merge. (4) All `recommended → finished` promotions **and** the single `CoverLog` row commit **atomically** in one transaction. (5) Hard-reject file deletes happen **before** the transaction; a delete failure aborts before any DB write — **no partial transition**. (6) **Exactly one** Factory email is enqueued per successful finalize. (7) Grade is computed on-demand, never persisted, emitted only on `finished`. (8) Only `ODPC`/admin may finalize; tier-1 → `403`. (9) End-state per Cover is **identical to the old batch model**. |

## Domain Events

| Event | Trigger | Payload |
| ----- | ------- | ------- |
| **FinalizeRejected(Unauthorized)** | caller is tier-1 (`level !== ODPC`) | `403` — no reads, no side effects |
| **FinalizeRejected(Unresolved)** | after reading logs, ≥1 Answer is `in_review` | `400` "unresolved in_review answers remain" — no side effects |
| **HardRejectFilesDeleted** | valid finalize, before the txn | for each Answer in the `HardRejectDeleteSet`: MinIO `deleteFile(fileUrl)` |
| **RecommendedPromotedToFinished** | inside the txn, per un-overridden `recommended` Answer | one appended `AnswerLog` `finished` (covers tier-1 approvals, Factory-accepts, and ODPC's own approvals) |
| **CoverFinalized** | inside the txn, `CoverOutcome === finished` | one `CoverLog` `finished` with `evaluatorId`; Grade computed |
| **CoverReturnedForRevision** | inside the txn, `CoverOutcome === in_progress` | one `CoverLog` `in_progress` with `evaluatorId`; no Grade |
| **FactoryNotified** | after successful commit | exactly one email enqueued via `enrolls.email` — "complete + Grade" (finished) or "revision needed" (in_progress) |

_The write-side events (`AnswerVerdictSaved` and specializations) belong to bolt 019 and are **not** re-emitted here — finalize only reads their persisted result._

## Domain Services

| Service | Operations | Dependencies |
| ------- | ---------- | ------------ |
| **FinalizeService** | `finalize(coverId, reviewer)` → `status(200, { coverStatus, grade? })` \| error | CoverAccessRepository, AnswerLogRepository, CoverLogRepository, FileStore, EmailQueue, GradeCalculator, and the pure policies below |
| **FinalizeValidityPolicy** | `assertNoInReview(latestStatuses)` → ok \| `400` | (pure) |
| **CoverTransitionPolicy** | `outcome(resolvedStatuses)` → `finished` \| `in_progress` | (pure) all-finished ⇒ finished; any-rejected ⇒ in_progress |
| **DeleteSetPolicy** | `hardRejectFiles(resolvedAnswers)` → `Answer.fileUrl[]` | (pure) `rejected` + `verdictChoice === null` + `fileUrl != null` |
| **GradePolicy** | `grade(coverId)` → Grade | `calculateBreakdown`, `computeGrade` (scoreHelpers, unchanged) — invoked only for the `finished` outcome |

**`finalize(coverId, reviewer)` ordered rules** (every failure returns `status(code, body)`, never throws):
1. **Authorization** — `reviewer.level === "ODPC"` (native or admin-as-national) → else `403` "finalize is ODPC-only". *(No DB read before this gate.)*
2. **Cover access** — `assertCoverAccess(coverId, reviewer.region)` (region-scoped or existence-only) → else `404`.
3. **Read snapshot** — fetch the **persisted latest** `AnswerLog` per Answer in the Cover (joined to `answers` for `fileUrl`). This snapshot is the sole input; no in-flight/`effectiveState` merge.
4. **Hard-gate** — `FinalizeValidityPolicy.assertNoInReview(...)`: any latest `in_review` → `400` "unresolved in_review answers remain". No verdict invented.
5. **Plan** (pure, from the snapshot):
   - `promotions` = Answers whose latest status is `recommended`.
   - `outcome` = `CoverTransitionPolicy.outcome(...)` (`finished` iff none `rejected`; else `in_progress`).
   - `deleteSet` = `DeleteSetPolicy.hardRejectFiles(...)`.
6. **File I/O (before txn)** — delete every file in `deleteSet` via `FileStore.deleteFile`. On failure, return an error **before** any DB write (no partial transition).
7. **Transaction (atomic)** — append one `finished` `AnswerLog` per `promotions` Answer **and** one `CoverLog` row (`outcome`, `evaluatorId = reviewer.accountId`), committed together.
8. **Grade** — if `outcome === finished`, `GradePolicy.grade(coverId)` (on-demand; not persisted).
9. **Email** — enqueue exactly one Factory email via `enrolls.email`: "complete + Grade" (finished) or "revision needed" (in_progress).
10. **Return** — `status(200, { coverStatus: outcome, grade? })`.

## Repository Interfaces

| Repository | Entity | Methods |
| ---------- | ------ | ------- |
| **CoverAccessRepository** | Cover | `assertCoverAccess(coverId, region)` → ok \| `404` (region-scoped or existence-only for national ODPC) |
| **AnswerLogRepository** | AnswerLog / Answer | `getLatestLogsForCover(coverId)` → `[{ answerId, status, verdictChoice, fileUrl }]` (latest row per Answer, joined to `answers`); `appendFinishedLogs(answerIds, evalId)` (inside txn) |
| **CoverLogRepository** | CoverLog | `appendCoverLog(coverId, status, evaluatorId)` (inside txn — the single transition row) |
| **EnrollRepository** | Enroll | `getFactoryEmail(coverId)` → `email` (via `enrolls.email`) |
| **FileStore** | (MinIO) | `deleteFileStrict(fileUrl)` — invoked **before** the txn for each hard-reject file; a failure aborts finalize (no partial transition) |
| **EmailQueue** | (BullMQ) | `enqueueFactoryOutcome(email, outcome, grade?)` — one job per finalize |
| **GradeCalculator** | (scoreHelpers) | `calculateBreakdown(coverId)` → breakdown; `computeGrade(breakdown)` → Grade |

_The existing Drizzle-backed access + `utilities().deleteFile` + `emailQueue` + `calculateBreakdown`/`computeGrade` satisfy these contracts; no schema change._

## Ubiquitous Language

| Term | Definition |
| ---- | ---------- |
| **Finalize** | ODPC's single, atomic, whole-Cover resolution — the sole writer of `finished` and of the Cover transition. |
| **Persisted snapshot** | The set of latest `answerLogs` (one per Answer) read at finalize; the **only** input — replaces the removed in-flight `effectiveState`/`batchDecisionMap` merge. |
| **Hard-gate** | The pre-commit refusal to finalize while any Answer is `in_review`; finalize never invents a verdict. |
| **Un-overridden recommended** | An Answer whose **latest** log is `recommended` (ODPC never overrode it with a reject) — promoted to `finished`. Because latest-wins, an override is simply a later `rejected` log. |
| **Promotion** | Appending one `finished` `AnswerLog` for an un-overridden `recommended` Answer — the only write of `finished`. |
| **Hard reject** | A `rejected` log with `verdictChoice === null` — its evidence file is deleted at finalize. |
| **Score change** | A `rejected` log with `verdictChoice ∈ {0–3}` — file **retained** (Factory sees the proposed correction). |
| **Cover outcome** | `finished` (all Answers finished ⇒ Grade + complete email) or `in_progress` (≥1 rejected ⇒ revision-needed email, no Grade). |
| **Deferred deletion** | Evidence-file deletes happen only at finalize, only for final hard-rejects, and strictly **before** the transaction (project file-I/O pattern). |
| **Grade** | On-demand computed score outcome (`calculateBreakdown`/`computeGrade`); never persisted (ADR-0001); emitted only on `finished`. |
| **Single finalizer** | ADR-0003's invariant: only ODPC/admin transitions a Cover; the two-finalizer window (DOED admin, specsmd ADR-3) stays benign via the gate + `finished` immutability. |
