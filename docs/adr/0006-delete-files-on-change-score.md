# ADR 0006: Delete evidence files on `change_score`, not just hard reject

**Status:** Accepted (2026-07-07)

**Supersedes:** the file-preservation clause of ADR-0005 — *"File deletion stays deferred to finalize... only for Answers whose final persisted status is hard-reject (`verdict_choice` null)"* — and FR-6 of intent `008-per-answer-verdict-save` ("A hard-reject later overridden... retains its files" as a change_score-specific exemption). Every other rule in ADR-0005 is unchanged: deletion stays deferred to `finalize`, stays outside-then-before the transaction, and `saveAnswerVerdict` still performs zero MinIO I/O.

## Context

ADR-0005 drew a line between two flavors of a `rejected` Answer:

- **Hard reject** (`verdict_choice` null) — evaluator rejects outright, no suggested replacement. Files deleted at finalize.
- **Change-score** (`verdict_choice` set) — evaluator suggests a lower score instead of the factory's choice. Files were **preserved** at finalize, on the reasoning that the file is still "the factory's evidence," just scored differently.

In practice this let a factory redo a `change_score` Answer without providing new evidence: `src/service/answer.ts`'s edit validator falls back to `existingAnswer.fileUrl3_1`-style checks when no new file is uploaded, so a preserved file silently satisfies the "file required" gate on redo. A factory could accept a downgraded score and resubmit the exact same file that was already judged insufficient for the higher score — the record needing re-review never got new evidence attached to it.

## Decision

Widen the finalize-time deletion predicate: any Answer whose **final** persisted status is `rejected` — whether via `change_score` or hard `reject` — has its `fileUrl1_1..fileUrl3_3` deleted from MinIO and nulled in the DB at finalize.

- **Predicate change only.** `hardRejectIds` (informally, now just "rejected-at-finalize IDs") drops the `verdictChoice === null` condition; it now includes every Answer whose latest `answerLogs` row is `status: rejected`, regardless of `verdictChoice`.
- **Timing unchanged.** Deletion still happens exclusively inside `finalize`, computed from the final persisted snapshot — never at `saveAnswerVerdict`. A `change_score` save still performs zero MinIO I/O.
- **Override semantics unchanged.** Because finalize only ever reads the *latest* `answerLogs` row per Answer, an Answer re-saved to `approve` before finalize runs is naturally excluded from deletion — no special-casing needed, this already falls out of the existing "latest-log-wins" read.
- **Cover-status / grade logic unchanged.** `hasRejected` already treats `change_score` as `rejected`; a Cover with any `change_score` Answer already resolved to `in_progress` before this ADR. That's untouched — this ADR is about file cleanup, not Cover outcome.
- **Redo now requires new evidence.** Once a `change_score` Answer's file is deleted at finalize, `src/service/answer.ts`'s existing file-requirement validator (which already errors when neither a new upload nor an existing file is present) forces the factory to upload a new file to redo that Answer — matching hard-reject behavior. No change needed in `answer.ts` itself; deleting the file is what activates the validator's existing branch.

## Considered options

- **Keep preserving change_score files (status quo, rejected).** Lets a factory resubmit a downgraded Answer with no new evidence — does not serve the driver.
- **Delete change_score files immediately at `saveAnswerVerdict` (rejected).** Breaks ADR-0005's "save has zero MinIO I/O" invariant and reopens the file-I/O-inside-a-hot-write-path problem ADR-0005 explicitly avoided; also complicates the "override before finalize retains files" case, since an immediate delete can't be undone if the evaluator changes their mind before finalize.
- **Widen the finalize-time predicate only (chosen).** Single-line predicate change; reuses the existing deferred, outside-txn deletion mechanism and the existing "latest-log-wins" override safety net.

## Reasons

- **Closes the evidence gap** — a downgraded Answer can no longer be redone by resubmitting the same file that was already judged insufficient.
- **Zero new mechanism** — reuses ADR-0005's deferred-deletion pipeline (`deleteFileStrict`, outside-then-before the transaction) verbatim; only the *set* of Answers fed into it changes.
- **No regression risk to the override case** — finalize's snapshot read already handles "changed my mind before finalize," so widening the predicate can't accidentally delete a file for an Answer that was re-saved to `approve`.

## Consequences

- **Irreversible once finalize commits.** A `change_score` Answer's original file cannot be recovered after finalize — the factory must upload a new file to redo it. No soft-delete or undo is introduced.
- **More factory upload friction on downgrade.** A factory that previously coasted through a `change_score` redo with the old file must now provide new evidence every time. This is the intended behavior change, not a side effect to mitigate.
- **`finalize`'s comment/variable naming should be updated** (e.g. `hardRejectIds` no longer means "hard reject only") to avoid the name implying the old, narrower semantics.
