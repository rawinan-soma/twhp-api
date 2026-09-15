---
run: run-twhp-elysia-010
work_item: adr-and-context-reconciliation
intent: score-change-finality
generated: 2026-08-25T10:17:00Z
---

# Code Review: run-twhp-elysia-010

## Files

| File | Change |
|------|--------|
| `docs/adr/0012-score-changes-are-terminal.md` | **new** |
| `docs/adr/0004-verdict-score-consensus-loop.md` | superseded-by note only |
| `docs/adr/0006-delete-files-on-change-score.md` | superseded-by note only |
| `CONTEXT.md` | six sections, the flow diagram, four resolved decisions, three endpoint rows, the Override rule |

No source files changed.

## Findings

### 1. Superseded entries annotated, not deleted — INFO, deliberate

`Resolved PO Decisions` keeps the original text of the reversed decisions behind a reversal note,
rather than rewriting history. A reader tracing why the system behaves this way needs the rejected
option and the instruction behind it, not a clean surface.

### 2. The stale entry was right for the wrong reason — INFO

`File handling on send-back` claimed change-score preserves files. That was false from 2026-07-07
(ADR-0006) until 2026-08-25 (ADR-0012), and is true again now. Left as a corrected entry with an
explicit note, since silently "fixing" it would hide that the docs and the code had diverged for
seven weeks.

### 3. Two stale claims the plan missed — LOW, fixed

The Override rule still said the Factory may "accept a change-score, object, or redo", and
`Verdict Score storage` still asserted `selectedChoice` is never overwritten. Both found by a grep
sweep rather than by the section list. Suggests planning doc edits by phrase search, not only by
section.

### 4. ADR claims verified against source — INFO

`evaluator-review.ts:375` and `answer.ts:778` were opened and confirmed before being cited.

## Standards compliance

- ✅ ADR follows the house structure used by 0001-0011.
- ✅ Superseded ADRs annotated at the top, bodies untouched.
- ✅ `CONTEXT.md` glossary links stay resolvable.
- ✅ No source or schema change.
