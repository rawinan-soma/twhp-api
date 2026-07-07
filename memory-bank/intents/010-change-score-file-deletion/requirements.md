---
intent: 010-change-score-file-deletion
phase: inception
status: complete
created: 2026-07-07T00:00:00.000Z
updated: 2026-07-07T00:00:00.000Z
---

# Requirements: Delete Evidence Files on `change_score` Verdicts

## Intent Overview

Widen the finalize-time evidence-file deletion rule so it covers **every** Answer whose final persisted verdict is `rejected` — not just hard rejects (`verdictChoice` null). Today, per ADR-0005 / intent `008-per-answer-verdict-save` FR-6, a `change_score` verdict (status `rejected`, `verdictChoice` set) explicitly **preserves** the factory's uploaded file at finalize. This intent reverses that clause: `change_score` now deletes files exactly like a hard reject.

This is a **brown-field enhancement** of `008-per-answer-verdict-save`, superseding one clause of **ADR-0005** (drafted alongside this intent as **ADR-0006**). No other part of ADR-0005 changes: file deletion stays deferred to `finalize`, remains outside-then-before the DB transaction, and `saveAnswerVerdict` still performs zero MinIO I/O. The `coverStatus`/grade logic (a `change_score` still resolves the Cover to `in_progress`, not `finished`) is unchanged.

## Business Goals

| Goal | Success Metric | Priority |
|------|-----------------|----------|
| No stale evidence survives a score downgrade | An Answer whose final finalize-time status is `rejected` (hard reject or change_score) has its `fileUrl*` columns nulled and the MinIO object deleted | Must |
| Factory must submit new evidence to redo a downgraded answer | After finalize, redoing a `change_score`-flagged Answer requires a new file upload — the existing answer-edit validator's `existingAnswer.fileUrl3_1`-style fallback no longer has a stale file to fall back on | Must |
| No change to Cover-level outcome semantics | `coverStatus`/grade computation in `finalize` is untouched — a `change_score` still forces the Cover to `in_progress`, same as today | Must |

---

## Functional Requirements

### FR-1: Widen the finalize-time file-deletion predicate

- **Description**: In `evaluatorReviewService.finalize`, the set of Answers whose evidence files are deleted changes from `status === "rejected" && verdictChoice === null` to just `status === "rejected"` (verdictChoice value no longer excludes an Answer from deletion).
- **Acceptance Criteria**:
  - An Answer whose latest persisted `answerLogs` row is `change_score` (`status: rejected`, `verdictChoice` set) has all its `fileUrl1_1..fileUrl3_3` columns nulled and the corresponding MinIO objects deleted when `finalize` commits.
  - An Answer whose latest persisted row is a hard `reject` (`status: rejected`, `verdictChoice` null) continues to have its files deleted — unchanged from today.
  - An Answer whose latest persisted row is `recommended` (not yet finalized) or already `finished` is untouched — files preserved, unchanged.
  - An Answer re-saved to `approve` *before* finalize runs is excluded from deletion, because finalize reads only the latest persisted `answerLogs` row per Answer (no new code needed for this — already true of the existing "latest-log-wins" read).
  - Deletion remains deferred to `finalize` only — `saveAnswerVerdict` performs zero MinIO I/O, unchanged.
  - Deletion remains outside-then-before the DB transaction (`deleteFileStrict`, abort with `500` before any write on failure) — unchanged file-I/O pattern.
- **Priority**: Must
- **Related Stories**: TBD

### FR-2: Cover-status and grade computation unchanged

- **Description**: This intent touches file deletion only. The `hasRejected` check, `coverStatus` resolution (`in_progress` vs `finished`), grade computation, and the finalize email selection in `finalize` are not modified.
- **Acceptance Criteria**:
  - `hasRejected` still evaluates `status === "rejected"` across all resolved Answers (already true — no code change required here).
  - A Cover with any `change_score`-flagged Answer still resolves to `coverStatus: "in_progress"`, `grade: null`, and the "in-progress" email — identical to current behavior.
- **Priority**: Must
- **Related Stories**: TBD

### FR-3: Both review surfaces stay in parity

- **Description**: `finalize` is shared code (`evaluatorReviewService.finalize`) between `evaluators/covers/*` and `admins/covers/*` (admin-as-national-ODPC via `adminReviewerContext`). The widened predicate applies identically to both — no surface-specific branching.
- **Acceptance Criteria**:
  - No new per-surface logic is introduced; the single `finalize` implementation continues to serve both routes.
- **Priority**: Must
- **Related Stories**: TBD

---

## Non-Functional Requirements

### Reliability

| Requirement | Metric | Target |
|---|---|---|
| Deletion atomicity | A MinIO deletion failure for any file in the widened set aborts finalize with `500` before any DB write | 100% (existing `deleteFileStrict` + pre-transaction pattern, unchanged) |

### Data integrity

| Requirement | Metric | Target |
|---|---|---|
| Irreversibility awareness | Once finalize commits, a `change_score`-flagged Answer's original file is unrecoverable — factory must re-upload to redo | Documented in ADR-0006; no soft-delete/undo in scope |

---

## Constraints

### Technical Constraints

- No schema change — `answerLogs` and `answers.fileUrl*` columns are unchanged; this is a predicate change inside `finalize`'s existing hard-reject computation.
- Must preserve the existing file-I/O pattern (delete outside and before the transaction) documented in `CLAUDE.md` ("File I/O is always done outside DB transactions").

### Business Constraints

- None beyond superseding the named ADR-0005 clause.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|---|---|---|
| The factory's answer-edit validator (`src/service/answer.ts:530-549`) already requires a new upload when `existingAnswer.fileUrl3_1`-style fallback is null | If the validator instead silently accepts a missing file for a previously-answered choice, factories could get stuck unable to redo a `change_score` Answer without evidence | Verified during requirements research: the validator already gates on `!dto.file_x_y && !existingAnswer.fileUrl_x_y`, so a nulled file correctly forces a new upload — no code change needed there |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|---|---|---|---|
| Should ADR-0006 also be recorded in `memory-bank/standards/decision-index.md`? | Construction Agent (owns decision-index per memory-bank.yaml) | At bolt-plan time | Resolved — added as ADR-5 in decision-index.md during bolt 023 Stage 3 |
