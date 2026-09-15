---
run: run-twhp-elysia-010
work_item: adr-and-context-reconciliation
intent: score-change-finality
mode: confirm
checkpoint: plan
approved_at: null
---

# Implementation Plan: Record the reversal and reconcile the domain docs

## Approach

Documentation only — no source changes, no tests.

1. **Write ADR-0012**, recording the reversal and everything decided across runs 005-009.
2. **Add superseded-by notes** to ADR-0004 and ADR-0006; no other edit to either.
3. **Reconcile `CONTEXT.md`** — six sections plus the flow diagram.

## Files to Modify

| File | Changes |
|------|---------|
| `docs/adr/0012-score-changes-are-terminal.md` | **new** |
| `docs/adr/0004-verdict-score-consensus-loop.md` | superseded-by note only |
| `docs/adr/0006-delete-files-on-change-score.md` | superseded-by note only |
| `CONTEXT.md` | `Verdict Score` (~74), `Negotiation Loop` (~83), `Answer Review` (~93), `Evaluator Verdict` (~112), `Re-evaluation Loop` (~133), the flow diagram (~144-214), `Resolved PO Decisions` (~215), `Review Endpoints` (~230) |

## What ADR-0012 must say

- **The reversal, named.** ADR-0004 evaluated "ODPC force-sets the final score" and rejected it
  because *"PO explicitly wanted the factory to be able to object with additional evidence."* That
  is now reversed for score changes. Said plainly, or the next reader reads this as drift.
- **Why it was reversed.** ADR-0006 (2026-07-07) broke ADR-0004's `accept` branch: it deleted the
  files that `accept` validates against, so the consensus loop had been redo-only in production for
  roughly six weeks. The reversal formalises what production was already doing, and stops it
  destroying evidence.
- **`redo` is refused too** — the factory's right to contest a score is gone, not merely its
  `accept` shortcut.
- **Hard reject is no longer byte-for-byte unchanged.** It now deletes standard certificates and
  un-claims them for the fiscal year, and reopens non-`finished` siblings.
- **Classification contract**: hard reject = `rejected` **and** null `verdict_choice`. This is what
  made the change deploy-safe on live rows with no backfill, and must not be narrowed back to a
  status-only test.
- **Consequences, prominently**: the factory's original `selectedChoice` is unrecoverable; an
  already-`finished` sibling can keep a score whose certificate is gone; certificate deletion is
  irreversible with no MinIO versioning; the deferred production backfill is outstanding.
- **Known-and-accepted**: no file check runs on a `change_score` in either direction.

## CONTEXT.md — the substantive rewrites

| Section | Now says | Must say |
|---------|----------|----------|
| `Verdict Score` (~74) | a *proposal* the factory accepts or objects to | a settled correction; final on save |
| `Negotiation Loop` (~83) | unbounded consensus for score disputes | retired for score changes; hard-reject redo only |
| `Answer Review` (~98-103) | change-score is `rejected` + `verdict_choice`; files preserved | change-score is `recommended` + `verdict_choice`; only hard reject writes `rejected` |
| `Evaluator Verdict` (~115) | change-score → `rejected`, files preserved | → `recommended`; and hard reject on a standard-backed question deletes certificates |
| `Re-evaluation Loop` (~137) | factory accepts or objects a change-score | factory acts only on hard rejects |
| Flow diagram (~167, ~203) | ACCEPT/OBJECT branches for change-score | terminal branch; loop only for hard reject |
| `Resolved PO Decisions` (~217-228) | consensus loop resolved; ODPC cannot force a score | reversed 2026-08-24, with the pointer to ADR-0012 |
| `Review Endpoints` (~237, ~239) | change/reject → `rejected`; factory accept/object | change → `recommended`; factory acts on hard rejects only |

**Line ~228 is separately stale**: it claims change-score *preserves* files, which stopped being
true when ADR-0006 shipped on 2026-07-07 and was never updated. It happens to describe the
behaviour we have restored, but for the wrong reason — the rewrite must not simply leave it.

## Verification

No tests to run. `bun test` is executed once to confirm the docs-only change breaks nothing, and
every code reference cited in the new ADR is checked against the current source before it is
written down.

---
*Plan approved at checkpoint. Execution follows.*
