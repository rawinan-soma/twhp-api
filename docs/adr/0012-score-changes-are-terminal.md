# ADR 0012: Score changes are terminal; the consensus loop survives for hard rejects only

**Status:** Accepted (2026-08-25)

**Supersedes:** ADR-0006 in full. ADR-0004 in part — its **Verdict Score**, four-value
`answerStatus`, ODPC-as-sole-finalizer, and Grade rules all stand; its **unbounded consensus loop**
no longer applies to score changes. Restores the file-preservation clause of ADR-0005 that ADR-0006
removed.

## Context

ADR-0004 (2026-06-16) considered making the evaluator's verdict final and **rejected it**:

> **ODPC force-sets the final score (rejected).** ODPC's verdict is final; the factory cannot
> contest… removes the factory's right to defend its evidence and makes ODPC's judgement
> unaccountable to the source data. **PO explicitly wanted the factory to be able to object with
> additional evidence.**

This ADR adopts the option that paragraph rejected. That is a reversal of a documented PO decision,
recorded here so no future reader mistakes it for drift.

**What changed in between is a mechanism failure, not a change of heart.**

ADR-0006 (2026-07-07) widened finalize's deletion predicate so a `change_score` Answer lost its
files, reasoning that the factory would then need new evidence to *redo* it. It missed that
`accept` — the other half of ADR-0004's loop — validates the factory's proposed choice against the
very columns finalize had just nulled (`answer.ts`, the per-choice file requirements). From
2026-07-07 onward, `accept` returned 400 for essentially every score change: only choice `"0"` and
standard-backed questions escaped.

So the consensus loop ADR-0004 designed to protect the factory had been **redo-only in production
for roughly six weeks**, and its practical effect was the opposite of its intent: an evaluator who
corrected a score caused the factory to lose its evidence and be forced to re-upload it, with no way
to simply agree.

The PO's instruction in August 2026 — that a recommended verdict, up or down, should be final —
formalises what production was already doing, and stops it destroying evidence.

## Decision

A **score change is terminal**. A **hard reject** keeps the loop.

- **Save.** `change_score` writes `recommended`, retaining `verdict_choice` and `description`. Only
  `reject` writes `rejected`. Only `finalize` writes `finished`.
- **No evidence check on a verdict, in either direction.** An evaluator may name any choice
  `0`–`3`. Refusing an unsupported upgrade would leave them only the hard reject, which destroys the
  factory's evidence and forces a redo — a worse outcome than honouring the verdict. The evaluator
  is the authority on what the evidence supports.
- **Finalize settles the score.** The Verdict Score is written into `answers.selected_choice` inside
  the finalize transaction, and the Grade computes from it. This is the write the factory's `accept`
  used to perform.
- **Evidence is preserved** for score changes. Only hard rejects lose files.
- **The Cover finishes in one pass** when its only corrections are score changes; only a hard reject
  drives `in_progress`.
- **The promotion row carries `verdict_choice` and `description` forward**, so the correction and its
  reason remain the factory's record after finalize.
- **The factory can no longer respond to a correction at all** — `accept` *and* `redo` are refused.
  ADR-0004's right to object is withdrawn for score changes; it survives for hard rejects.
- **A hard reject on a standard-backed question now deletes the standard certificates** it names and
  the factory claims, un-claims them on `Enrolls`, and returns non-`finished` sibling Answers backed
  by those standards to `in_review`.

### Classification contract (normative)

> A hard reject is `status = 'rejected'` **AND** `verdict_choice IS NULL`.
> A settled score change is any Answer whose latest log carries a non-null `verdict_choice`,
> whatever its status.

This is load-bearing and must not be narrowed to a status-only test. A score change exists in two
shapes: `recommended` (written since this ADR) and `rejected` (written before it, still in
production). Keying on `verdict_choice` — only ever written by `change_score` — is what let this
change ship against live data with **no migration**.

## Considered options

- **Keep the consensus loop and fix `accept` (rejected).** Restores ADR-0004's intent and is the
  smaller change. Rejected because the PO's requirement is finality, not a working loop, and because
  it would leave every corrected Cover needing a second review pass.
- **Make score changes terminal but keep an evidence guard on upgrades (rejected).** Implemented,
  then removed on 2026-08-24: the only alternative it left an evaluator was the hard reject, which is
  strictly worse for the factory.
- **Make score changes terminal, no evidence check (chosen).** One discriminator drives every
  downstream behaviour, legacy rows need no backfill, and the factory keeps its evidence.

## Reasons

- **Stops active harm.** The pre-existing behaviour destroyed factory evidence on every score
  correction and forced rework that `accept` could not complete.
- **One review pass.** A Cover whose corrections are all score changes now closes without a
  round-trip.
- **No migration.** The `verdict_choice` classification handles production rows written under the old
  semantics on their next finalize.
- **No schema change.** `answerStatus` already carried `recommended`; `verdict_choice` was already
  nullable.

## Consequences

- **The factory's original claim is unrecoverable.** `selected_choice` is overwritten at finalize and
  no column preserves the prior value. `accept` already overwrote it, so nothing that survived the
  old flow is lost — but the correction is now invisible as a *delta*. Restoring it requires a schema
  change and is deliberately left to a separate intent.
- **The factory cannot contest a score.** Accepted per the PO's instruction; this is the substance of
  the reversal.
- **Certificate deletion is irreversible.** No MinIO versioning is configured. A certificate is issued
  by an external body, so a mistaken hard reject on a standard-backed question costs the factory
  real-world effort. An evaluator-side confirmation in the frontend is recommended and is outside
  this repository.
- **One rejection can delete several certificates** and un-claim them for the whole fiscal year, not
  merely the Cover — one question may name up to five standards, and a standard may back four
  questions.
- **An already-`finished` sibling can keep a score whose certificate is gone.** Reopening it would
  break "`finished` is immutable to everyone", so the reset is bounded to non-`finished` Answers.
  Fixing this residue requires overturning that invariant and belongs to its own intent.
- **A production backfill remains outstanding**, deferred by explicit decision on 2026-08-23. The
  classification contract above is expected to reduce it to near-zero, but the exposure was never
  measured. Covers already finalized under ADR-0006 have lost evidence that no code change recovers.
- **The `accept` branch is retained but unreachable** for score changes, pending confirmation that no
  deployed frontend still calls it.

## Provenance

Delivered as intent `score-change-finality`, runs `run-twhp-elysia-005` through `-010`. Each run's
plan, test report, review report, and walkthrough are under `.specs-fire/runs/`.
