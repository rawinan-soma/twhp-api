---
run: run-twhp-elysia-010
work_item: adr-and-context-reconciliation
intent: score-change-finality
generated: 2026-08-25T10:15:00Z
status: passing
---

# Test Report: Record the reversal and reconcile the domain docs

## Summary

| Category | Passed | Failed | Skipped |
|----------|--------|--------|---------|
| Full suite (`bun test`) | 537 | 0 | 1 |

Documentation-only run — no tests written, none needed. The suite was run to confirm the change
touches no behaviour.

## Acceptance Criteria Validation

- ✅ **New ADR under `docs/adr/`, next in sequence, house structure** — `0012-score-changes-are-terminal.md` (Status / Context / Decision / Considered options / Reasons / Consequences / Provenance).
- ✅ **States it supersedes ADR-0006 in full and ADR-0004 in part** — and that it restores ADR-0005's file-preservation clause.
- ✅ **ADR-0004 and ADR-0006 carry superseded-by notes; neither edited beyond that** — a status line and a blockquote each; the original reasoning is untouched.
- ✅ **The `verdict_choice IS NULL` classification recorded as the legacy-compatible contract** — marked normative in both the ADR and `CONTEXT.md`, with the no-backfill rationale and an explicit warning not to narrow it to a status-only test.
- ✅ **`CONTEXT.md` updated** — `Verdict Score`, `Negotiation Loop`, `Answer Review`, `Evaluator Verdict`, `Re-evaluation Loop`, the ASCII flow diagram, `Resolved PO Decisions` (4 entries), `Review Endpoints` (3 rows), and the Override rule.
- ✅ **No dangling `[[Negotiation Loop]]` describing a retired loop** — the section is retitled "(hard rejects only)"; every reference points at the surviving meaning.
- ✅ **The stale file-handling claim corrected** — the entry that said change-score preserves files was right by accident between 2026-07-07 and 2026-08-25; it now says so, with the reason it is right again.
- ✅ **The deferred backfill named in Consequences** — with the note that finalized Covers have lost evidence no code change recovers.

## Verification performed

Every code reference cited in the ADR was checked against current source before being written:
`evaluator-review.ts:375` (the status map), `answer.ts:778` (the finality guard). A grep sweep for
stale phrasing (`accepts or objects`, `never overwritten`, `unbounded`, `proposed score`) found two
further entries — the Override rule and `Verdict Score storage` — that the plan had not listed;
both were corrected.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| Two stale `CONTEXT.md` claims outside the planned section list (Override rule ~109, Verdict Score storage ~222) | low | **Fixed** — found by the grep sweep, not by the plan |
| A batched edit script aborted on one failed assertion, silently discarding six earlier successful replacements | low | **Fixed** — re-run per-edit with pass/miss reporting so a single miss cannot roll back the rest |

## Ready for Completion

- [x] All tests passing (no behaviour touched)
- [x] All acceptance criteria validated
- [x] No critical issues open
