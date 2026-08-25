---
run: run-twhp-elysia-010
work_item: adr-and-context-reconciliation
intent: score-change-finality
completed: 2026-08-25T02:39:54.724Z
---

# Walkthrough: Record the reversal and reconcile the domain docs

## What changed

Documentation only. `ADR-0012` records the reversal; `ADR-0004` and `ADR-0006` are annotated;
`CONTEXT.md` is brought back in line with the code.

## The thing the ADR exists to say

ADR-0004 considered making the evaluator's verdict final and rejected it, in these words:

> **ODPC force-sets the final score (rejected).** … **PO explicitly wanted the factory to be able
> to object with additional evidence.**

ADR-0012 adopts exactly that option. Stated in the opening lines, because a future reader who finds
the two documents side by side must see a decision, not drift.

It also records **why** the reversal is not a change of heart: ADR-0006 (2026-07-07) deleted the
files that ADR-0004's `accept` branch validates against, so `accept` had been returning 400 for
essentially every score change. The consensus loop designed to protect the factory had been
redo-only in production for six weeks, with the opposite of its intended effect — the factory lost
its evidence and was forced to re-upload it. The reversal formalises what production was doing and
stops the destruction.

## What else the ADR pins down

- **The classification contract, marked normative**: a hard reject is `rejected` **and** null
  `verdict_choice`. This is what let the change ship against live data with no migration, and a
  future reader narrowing it back to a status-only test would silently break legacy rows.
- **The scope that grew mid-intent**: `redo` refused as well as `accept`; hard reject no longer
  unchanged, now deleting standard certificates and reopening siblings.
- **Six consequences**, including the two that outlive the intent: the factory's original claim is
  unrecoverable without a schema change, and a production backfill remains outstanding.

## CONTEXT.md

Six glossary sections, the ASCII flow diagram, four `Resolved PO Decisions`, three `Review
Endpoints` rows, and the Override rule.

Reversed decisions are **annotated, not deleted** — the original text stays behind a reversal note,
because a reader tracing why the system behaves this way needs the rejected option and the
instruction behind it.

One entry deserved special handling. `File handling on send-back` claimed change-score preserves
files. That was false from 2026-07-07 to 2026-08-25 and is true again now. Quietly "correcting" it
would have hidden that the docs and the code had disagreed for seven weeks, so it carries a note
saying exactly that.

## Two process notes

**The plan's section list was not enough.** A grep sweep for stale phrasing (`accepts or objects`,
`never overwritten`, `unbounded`, `proposed score`) turned up two further entries the plan had not
listed — the Override rule and `Verdict Score storage`, both still asserting the old model. Doc
reconciliation is better planned by phrase search than by section.

**A batched edit script aborted on one failed assertion and silently discarded six earlier
successful replacements**, because the file is only written at the end. Re-run with per-edit
pass/miss reporting. Worth remembering for any multi-edit script.

## Verification

`bun test` — **537 pass, 0 fail, 1 skip**; no behaviour touched. Every code reference cited in the
ADR (`evaluator-review.ts:375`, `answer.ts:778`) was opened and confirmed before being written down.
