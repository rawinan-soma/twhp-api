---
unit: 001-per-answer-verdict-save
bolt: 019-per-answer-verdict-save
stage: model
status: complete
updated: 2026-07-02T07:22:43Z
---

# Static Model - Per-Answer Verdict Save (write path)

## Bounded Context

The **Evaluator Review** context, write side. This bolt models the act of an Evaluator recording a verdict on **one** Answer at a time as an append-only event, plus the policy that governs who may write over an Answer's current state. It deliberately excludes finalization (bolt 020) and route/transport concerns (bolt 021): no Cover transition, no file I/O, no email, and no `finished` status are produced here.

Scope = stories **001-verdict-schema-refactor**, **002-save-answer-verdict-service**, **003-authorship-edit-guard**.

## Domain Entities

| Entity | Properties | Business Rules |
| ------ | ---------- | -------------- |
| **Answer** | `id`, `coverId`, `questionId` (→ `category`), `selectedChoice` (the factory's live choice) | Must belong to the target Cover to be verdicted. Its **current status** is not stored on the row — it is derived from the latest `AnswerLog`. `selectedChoice` is never mutated by a verdict (only the factory owns it). |
| **AnswerLog** | `id` (serial, ordering), `answerId`, `status` (AnswerStatus), `verdictChoice` (Choices `0–3` \| null), `description` (text \| null), `evalId` (author) | **Append-only** — a verdict is a new row, never an update. The row with the greatest `id` for an `answerId` is authoritative. `evalId` records the author for the authorship guard. A save writes exactly **one** row. |

## Value Objects

| Value Object | Properties | Constraints |
| ------------ | ---------- | ----------- |
| **VerdictEntry** | `decision` ∈ {`approve`, `change_score`, `reject`} + decision-dependent fields | `approve`: no `verdictChoice`, no `description`. `change_score`: `verdictChoice` ∈ {`0`,`1`,`2`,`3`} **and** `description` (non-empty). `reject`: `description` (non-empty), no `verdictChoice`. `answerId` is **not** part of this object (it is the path identity). |
| **FinalizeBody** | (empty `{}`) | Placeholder value object for the finalize endpoint's body; defined here for schema completeness, consumed by bolt 020. |
| **AnswerStatus** | one of `in_review`, `recommended`, `rejected`, `finished` | Enum unchanged (4 values). This bolt writes only `recommended` and `rejected`; never `finished`. |
| **ReviewerContext** | `accountId`, `level` (`Mental`\|`DOH`\|`ODPC`), `region` (number \| null) | `region: null` ⇒ national reviewer (existence-only Cover access). Level determines category scope. |
| **CategoryScope** | derived set of categories for a level | `Mental → {Mental}`; `DOH → {Disease, Safety}`; `ODPC → all 5`. Disjoint across tier-1 levels. |
| **VerdictOutcome** | resolved (`status`, `verdictChoice`, `description`) for a decision | `approve → (recommended, null, null)` for **every** level; `change_score → (rejected, choice, desc)`; `reject → (rejected, null, desc)`. |

## Aggregates

| Aggregate Root | Members | Invariants |
| -------------- | ------- | ---------- |
| **Answer** (verdict history) | the `Answer` row + its ordered `AnswerLog` stream | (1) Current status = latest log's status. (2) A save appends exactly one log for one Answer. (3) `finished` is terminal and immutable to everyone. (4) A `recommended` log is writable only by its author (`evalId`) or by ODPC. (5) `rejected`/`in_review` are writable by any category-scoped reviewer. (6) `approve` never yields `finished` (always `recommended`). (7) A `change_score` whose `verdictChoice` equals the Answer's live `selectedChoice` is a rejected no-op. |

## Domain Events

| Event | Trigger | Payload |
| ----- | ------- | ------- |
| **AnswerVerdictSaved** | A reviewer's `saveAnswerVerdict` passes all guards | `answerId`, resolved `status`, `verdictChoice`, `description`, `evalId` (one new AnswerLog) |
| ↳ **RecommendationRecorded** (specialization) | decision = `approve` | status `recommended`, null choice/description |
| ↳ **ChangeScoreProposed** (specialization) | decision = `change_score` | status `rejected`, `verdictChoice` `0–3`, `description` |
| ↳ **AnswerRejected** (specialization) | decision = `reject` | status `rejected`, null choice, `description` |

_Out of scope (bolt 020): `RecommendedConvertedToFinished`, `CoverTransitioned`, `HardRejectFilesDeleted`, `FactoryNotified`._

## Domain Services

| Service | Operations | Dependencies |
| ------- | ---------- | ------------ |
| **VerdictSaveService** | `saveAnswerVerdict(coverId, answerId, reviewer, entry)` → new status \| error | AnswerRepository, AnswerLogRepository, CategoryScopePolicy, EditPermissionPolicy |
| **CategoryScopePolicy** | `categoriesFor(level)`; `isInScope(answerCategory, level)` | (pure) level→category map |
| **EditPermissionPolicy** | `canWrite(currentStatus, currentAuthorId, reviewer)` → allow \| deny(code) | (pure) authorship guard rules |

**`saveAnswerVerdict` ordered rules** (all failures return `status(code, body)`, never throw):
1. Cover access — region-scoped for evaluators; existence-only for national ODPC → `404` if not accessible.
2. Answer exists **and** belongs to `coverId` → else `400`/`404`.
3. Category scope — Answer's category ∈ `categoriesFor(reviewer.level)` → else `403`.
4. Edit permission — `EditPermissionPolicy.canWrite(latestStatus, latestAuthor, reviewer)`:
   - `finished` → deny `400` (immutable to all).
   - `recommended` → allow iff `reviewer.level === ODPC` **or** `latestAuthor === reviewer.accountId`; else `403`.
   - `rejected` / `in_review` (or no log yet) → allow (scope already checked).
5. No-op guard — `change_score` with `verdictChoice === answer.selectedChoice` → `400`.
6. Append one AnswerLog with the resolved VerdictOutcome + `evalId = reviewer.accountId`.
7. Return the new status. **No** MinIO, `coverLogs`, or email side effects.

## Repository Interfaces

| Repository | Entity | Methods |
| ---------- | ------ | ------- |
| **CoverAccessRepository** | Cover | `assertCoverAccess(coverId, region)` → ok \| 404 (region-scoped or existence-only) |
| **AnswerRepository** | Answer | `getAnswerInCover(coverId, answerId)` → `{ category, selectedChoice }` \| not-found |
| **AnswerLogRepository** | AnswerLog | `getLatestLog(answerId)` → `{ status, evalId }` \| none; `appendLog(row)` |

_These describe the data-access contract the service depends on; the existing Drizzle-backed access in the evaluator-review service satisfies them (no schema change)._

## Ubiquitous Language

| Term | Definition |
| ---- | ---------- |
| **Per-Answer save** | Recording a verdict for a single Answer as one appended `AnswerLog`; durable and resumable; the unit of the write phase. |
| **Verdict** | A reviewer's decision on one Answer: `approve`, `change_score`, or `reject`. |
| **Live choice** | The Answer's `selectedChoice` (the factory's own value) used for the no-op change-score check. |
| **Verdict Score** | An evaluator's proposed corrected choice (`verdictChoice`, `0–3`), carried on a `change_score`. |
| **recommended** | Provisionally settled: an approve by any reviewer (tier-1 or ODPC). Overridable; **not** `finished`. |
| **Authorship** | The `evalId` of the reviewer who wrote the current log; the key for editing a `recommended`. |
| **Edit guard** | The permission policy over the current status: finished→none; recommended→author/ODPC; rejected/in_review→scoped. |
| **Category scope** | The set of QuestionCategories a level may act on (Mental/DOH/ODPC map). |
| **No-op change-score** | A `change_score` equal to the live choice — rejected; the reviewer should `approve`. |
| **Backstop / finalize** | ODPC's whole-Cover resolution — **out of scope for this bolt** (bolt 020). |
