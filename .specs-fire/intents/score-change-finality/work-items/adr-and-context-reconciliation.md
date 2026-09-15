---
id: adr-and-context-reconciliation
title: Record the reversal and reconcile the domain docs
intent: score-change-finality
complexity: medium
mode: confirm
status: completed
depends_on:
  - finalize-settles-score
  - retire-score-negotiation
  - finalize-email-changed-answers
created: 2026-08-23T15:20:34Z
run_id: run-twhp-elysia-010
completed_at: 2026-08-25T02:39:54.724Z
---

# Work Item: Record the reversal and reconcile the domain docs

## Description

Write the ADR that records this reversal, and bring `CONTEXT.md` back in line with the code.

The ADR must be explicit that ADR-0004 evaluated "ODPC force-sets the final score" and rejected it
on the PO's instruction that the factory must be able to object — and that this is now reversed for
score changes, with the consensus loop retained for hard rejects. It should also record the
mechanism failure that motivated the reversal: ADR-0006's file deletion broke ADR-0004's `accept`
branch on 2026-07-07, leaving the loop redo-only in production. Without that, a future reader will
read this as drift.

`CONTEXT.md` is separately stale and predates ADR-0006 — line 228 still claims change-score
preserves files. Reconcile it against shipped behaviour, not just against this intent.

## Acceptance Criteria

- [ ] New ADR added under `docs/adr/`, numbered next in sequence, following the house structure
      (Status / Context / Decision / Considered options / Reasons / Consequences).
- [ ] It states it supersedes ADR-0006 in full and ADR-0004 in part, and restores ADR-0005's
      file-preservation clause.
- [ ] ADR-0004 and ADR-0006 carry a superseded-by note; neither is edited beyond that.
- [ ] The `verdict_choice IS NULL` hard-reject classification is recorded as the legacy-compatible
      contract, with its no-backfill rationale.
- [ ] `CONTEXT.md` updated: the Negotiation Loop section, the verdict-outcome model (lines ~81-137),
      the ASCII flow diagram (~167-217), the resolved-decisions list (~217-241), and the stale
      file-handling claim at ~228.
- [ ] Glossary/link terms stay consistent — no dangling `[[Negotiation Loop]]` reference left
      describing a loop that no longer applies to score changes.
- [ ] The deferred production backfill is named in the ADR's Consequences as known outstanding work.

## Technical Notes

Runs last on purpose: an ADR records what was decided and shipped, and `CONTEXT.md` should be
reconciled against the final code rather than the plan.

## Dependencies

- finalize-settles-score
- retire-score-negotiation
- finalize-email-changed-answers
