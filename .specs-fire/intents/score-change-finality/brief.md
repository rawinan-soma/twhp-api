---
id: score-change-finality
title: Score-Change Finality
status: completed
created: 2026-08-23T15:20:34Z
priority: urgent
supersedes_adr:
  - 0004 (partial)
  - 0006 (full)
completed_at: 2026-08-25T02:39:54.729Z
---

# Intent: Score-Change Finality

## Goal

Make an evaluator's **score change** a terminal verdict: once an auditor rules that the evidence
supports a different choice — upward or downward — the ruling stands, the Cover can reach
`finished`, and the factory has nothing to negotiate. The factory's uploaded evidence is preserved,
and the corrected score is what the Grade computes from.

A **hard reject** is untouched: files are still deleted at finalize, the Cover still returns to
`in_progress`, and the factory still redoes the Answer with new evidence.

The entire divergence lives in one expression (`src/service/evaluator-review.ts:367-369`):

```ts
const outcomeStatus =
  entry.decision === "approve" ? ("recommended" as const) : ("rejected" as const);
```

`change_score` and `reject` collapse into a single `rejected` status, and every downstream
behaviour — file deletion, Cover status, negotiation eligibility, Grade input — keys off it.

## Users

- **Factory** — stops being asked to negotiate a score the auditor already settled, and stops
  losing evidence it uploaded. The actor this intent primarily exists to protect.
- **Evaluator at level Mental or DOH** — its `change_score` becomes a settled correction rather
  than a proposal that bounces the whole Cover back a stage.
- **Evaluator at level ODPC** — finalizes; gains the ability to close a Cover that contains score
  changes, which is currently impossible without a full negotiation round-trip.
- **DOED Admin** — same as ODPC via admin-as-national.
- **PO / records** — gains Covers that reach `finished` in one review pass, with the corrected
  scores visible in the Grade.

## Problem

A `change_score` is treated as a rejection in every respect, which produces three distinct failures.

**1. The Cover cannot finish.** `hasRejected` (`evaluator-review.ts:523-524`) sends any Cover
containing a score change back to `in_progress`, requiring a factory negotiation round before ODPC
can finalize — for a decision the auditor considers closed.

**2. Evidence is destroyed.** Finalize deletes and nulls `fileUrl1_1..fileUrl3_3` for every
`rejected` Answer, change_score included (`:485-544`), per ADR-0006.

**3. The negotiation loop it bounces into is itself broken.** `accept` validates that files exist
for the new choice (`answer.ts:820-839`) against the columns finalize just nulled, so it returns
400 — *"choice 2 requires at least file_1_1 and file_2_1"*. Only choice `"0"` and
standard-questions-with-matching-standard (early return, `:805-815`) escape. **ADR-0006 (2026-07-07)
broke ADR-0004's (2026-06-16) consensus loop and nobody noticed**: ADR-0006 reasoned only about the
*redo* branch reaching the file validator, and missed that `accept` reads the same nulled columns.
The unbounded consensus loop has been redo-only in production for roughly six weeks.

The net production behaviour today: an auditor who corrects a score causes the factory to lose its
evidence and be forced to re-upload it, with no way to simply agree.

**4. The correction never reaches the Grade on its own.** `accept` is the only code path that ever
writes a Verdict Score into `answers.selectedChoice` (`answer.ts:843-849`), and the Grade computes
from `selectedChoice` (`evaluator-review.ts:552-556`). Removing negotiation without addressing this
would make score changes silently cosmetic — the single most likely way to get this intent wrong.

## Success Criteria

- `change_score` saves as `recommended` with its `verdictChoice` retained; only a hard `reject`
  writes `rejected`.
- A Cover whose only non-approve verdicts are score changes reaches `finished` in one pass, with no
  factory negotiation and no `in_progress` bounce.
- Evidence files on a score-changed Answer survive finalize — present in MinIO and non-null in the
  DB afterwards.
- The Grade for such a Cover computes from the auditor's `verdictChoice`, not the factory's original
  `selectedChoice`.
- Hard reject is byte-for-byte unchanged: files deleted, Cover → `in_progress`, redo available.
- An upgrade whose required evidence does not exist is refused at **save** time with a 400, not at
  finalize.
- A saved score change is overridable only by its author or ODPC, identical to `approve`.
- The finished-Cover email lists the Answers whose score was changed.
- **Deploy-safe on live data with no backfill**: existing `rejected` + non-null `verdict_choice`
  rows are treated as terminal score changes, so no already-saved verdict loses its evidence at the
  next finalize.
- No database schema change — `answerStatus` already carries `recommended`.

## Constraints

- **No schema changes.** The four-value `answerStatus` pgEnum and the nullable
  `answerLogs.verdict_choice` column are sufficient. Decided 2026-08-23.
- **`AnswerLogs` is append-only** — it is the audit trail. Corrections are new rows, never `UPDATE`s
  of historical rows.
- **Production carries live data.** Any classification change must be correct for rows written
  under the old semantics, without a migration. This forces the hard-reject test to be
  `status = 'rejected' AND verdict_choice IS NULL` rather than `status = 'rejected'`.
- **Supersedes ADR-0006 in full.** Its driver — "a factory could redo a downgraded Answer by
  resubmitting the same file" — dissolves once a score change is never redone at all. The gap
  closes by removing the loop, not by deleting evidence. Restores ADR-0005's original
  file-preservation clause.
- **Supersedes ADR-0004 in part.** ADR-0004 evaluated "ODPC force-sets the final score" and
  rejected it on the PO's explicit instruction that the factory must be able to object. That is now
  reversed for score changes; the consensus loop is retained for hard reject only. **A new ADR must
  record this reversal and its rationale** — the reversal is the substance of this intent, and the
  next reader must not mistake it for drift.
- Standard project constraints: services return `status(code, body)`, file I/O outside DB
  transactions, no direct `main` commits, no direct migration edits.

## Out of Scope

Deliberately excluded, not overlooked:

- **Production backfill of pre-existing rows.** Deferred by explicit decision on 2026-08-23. The
  `verdict_choice IS NULL` classification above is expected to reduce this to near-zero, but the
  exposure has not been measured. **A reminder is owed to the human at this intent's completion.**
- **Bucket C remediation** — Covers already `finished` whose score-changed evidence was deleted
  under ADR-0006. Unrecoverable unless MinIO versioning turns out to be enabled; a records decision
  for the PO, not an engineering one.
- **MinIO versioning check** (`mc version info`) — operational, and worth doing before any cleanup
  touches the bucket.
- Any change to how tier-1 vs ODPC scoping, region access, or fiscal-year writability behave.

## Notes

Urgency is real: this is live production behaviour destroying factory evidence on every score
correction, and it has been doing so since 2026-07-07.

The four design decisions were confirmed with the human on 2026-08-23:

1. Finalize writes `verdictChoice` into `answers.selectedChoice` alongside the
   `recommended` → `finished` promotion — the same effect `accept` produced, minus the factory.
   Chosen over a read-time overlay, which would touch every scoring consumer (`score.ts`,
   `scoreHelpers.ts`, and all Grade call sites).
2. ~~Evidence sufficiency for an upgrade is enforced at save time (400).~~ **Reversed
   2026-08-24**: no file check runs on a `change_score` in either direction. Refusing an upgrade
   leaves the evaluator only the hard reject, which deletes the factory's evidence and forces a
   redo — a worse outcome than honouring the verdict. The evaluator is the authority on what the
   evidence supports. This also removes the standard-backed asymmetry that run 005's review
   flagged, since no question is file-checked any more.
3. The `recommended` edit guard (`:353`) applies to score changes: author or ODPC only. This is a
   deliberate tightening; as `rejected` they were editable by any category-scoped reviewer.
4. The finished email enumerates changed Answers, since the factory now learns of a downgrade only
   at the final grade.

The consensus loop's `accept` branch becomes unreachable for score changes once no score change
lands in `rejected`. Whether the dead branch is removed or left with a defensive 400 is a
decomposition-level decision.
