---
work_item: finalize-settles-score
intent: score-change-finality
created: 2026-08-24T04:35:00Z
mode: validate
checkpoint_1: approved
approved_at: 2026-08-24T04:40:00Z
---

# Design: Finalize settles the verdict score and spares its evidence

## Summary

`finalize` currently treats every `rejected` Answer alike: delete its evidence, bounce the Cover to
`in_progress`. After `verdict-save-terminal-score`, a score change no longer *is* `rejected` — but
finalize still has no idea what to do with a `recommended` Answer carrying a `verdictChoice`. It
promotes it to `finished` and computes the Grade from the factory's untouched `selectedChoice`, so
the correction evaporates.

This design makes finalize the place where a Verdict Score becomes the settled score — the role
`accept` used to play — and narrows file deletion to hard rejects only, in a way that is also
correct for production rows written under the old semantics.

## Scope

**In**
- Hard-reject classification and the deletion set (`:510-514`)
- Cover status derivation (`:544-545`)
- Promotion rows (`:496-508`) and the settled-score write, inside the transaction
- Grade input (`:574-580`)

**Out**
- Save-time behaviour (shipped in run 005)
- The factory negotiation endpoint (`retire-score-negotiation`)
- Email content (`finalize-email-changed-answers`)
- Any production backfill

## Key Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | How is a hard reject identified? | `status === "rejected" && verdictChoice === null` | Legacy rows written as `rejected` + non-null `verdict_choice` then classify as score changes automatically. This is what makes the fix deploy-safe on live production data with no migration — the single most valuable property in the design. |
| 2 | How does the corrected score take effect? | Write `verdictChoice` into `answers.selectedChoice` inside the finalize transaction | Every scoring consumer (`score.ts:74,85,222`, `scoreHelpers.ts`, the factory score report) already reads `selectedChoice`. A read-time overlay would have to be added to each and kept in sync forever. |
| 3 | Is the factory's original choice preserved? | **No** — accepted loss | ADR-0004 promised `selectedChoice` is "never overwritten", but `accept` (`answer.ts:843-849`) already overwrote it whenever a factory accepted. This design moves the same write from factory-accept to finalize; it destroys nothing that survived the old flow. Preserving it would need a column, which the no-schema-change constraint forbids. Recorded as an ADR consequence. |
| 4 | What does the promotion row carry? | `verdictChoice` **carried forward**, not nulled | The current promotion writes `verdictChoice: null` (`:500`). For a settled score change that would erase the correction from the latest log — and the factory-facing read (`answer.ts:401-420`) reads exactly that row. Carrying it forward keeps "your score vs. our verdict" legible after finalize and gives `retire-score-negotiation` something to render. |
| 5 | Grade input | Overlay settled choices in memory before `calculateBreakdown` | `allCoverAnswers` is read *before* the transaction (`:574`), so it still holds pre-correction values even after the DB write. Overlaying in memory avoids a re-read and keeps the existing single-read shape. |
| 6 | Cover status | `in_progress` only when a **hard reject** exists | A score change is settled; nothing is owed by the factory. Rename `hasRejected` → `hasHardReject` so the predicate cannot silently drift back. |
| 7 | Narrow the save-time standard exemption? | **No, not here** | Carried from run 005's review. The exemption lets an evaluator set an unsupported choice on a standard-backed question whose factory lacks the standard. Real but narrow, evaluator-initiated, and orthogonal to finalize. Recorded in the ADR as known, not silently kept. |

## Data Models Affected

**Modifies (rows, not schema)**
- `Answers.selectedChoice` — set to the Verdict Score for settled score changes
- `AnswerLogs` — one appended `finished` row per promoted Answer, now carrying `verdictChoice`
- `CoverLogs` — one transition row, unchanged in shape

No column, enum, index, or constraint changes. `answerStatus` already carries every state needed.

## Technical Approach

```
resolved (latest persisted log per Answer)
   │
   ├── in_review ──────────────────────► hard gate: 400, finalize invents no verdict
   │
   ├── rejected + verdictChoice = null ─► HARD REJECT
   │        └ delete files (outside txn, strict) → null URLs → Cover in_progress
   │
   ├── recommended + verdictChoice set ─► SETTLED SCORE CHANGE   ◄── new
   │        └ keep files → selectedChoice := verdictChoice → promote to finished
   │
   ├── rejected + verdictChoice set ────► SETTLED SCORE CHANGE (legacy rows)  ◄── new
   │        └ same treatment; no backfill required
   │
   └── recommended + no verdictChoice ──► plain approve → promote to finished
```

Ordering inside `finalize` is unchanged and load-bearing: classify → delete files (outside and
before the transaction, strict) → transaction (promotions, `selectedChoice` writes, file nulling,
one `coverLogs` row) → Grade → email.

### Database Changes

None.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| A legacy row is misclassified and its evidence deleted anyway | Decision 1 keys on `verdictChoice`, and an explicit test constructs a legacy-shaped row (`rejected` + `verdict_choice`) and asserts its files survive |
| Grade computed from stale in-memory values | Decision 5 overlays before `calculateBreakdown`; a test asserts the Grade moves when a score is corrected |
| `selectedChoice` overwritten for an Answer that was *not* settled | The write is keyed to the same classified set as the promotion, not to "has a verdictChoice anywhere in history" — only the latest log counts |
| Partial state if MinIO fails | Unchanged: `deleteFileStrict` runs before the transaction and aborts finalize with 500 before any DB write |
| Existing finalize tests encode the old semantics | They construct `rejected` + `verdictChoice` rows directly, so they now describe the legacy path — they are updated to assert the *new* expectation for that shape, not deleted |

## Implementation Checklist

- [ ] Classify `resolved` into hard rejects, settled score changes, and plain approvals
- [ ] Deletion set = hard rejects only
- [ ] `hasRejected` → `hasHardReject`; Cover status derives from it
- [ ] Promotion rows carry `verdictChoice` forward for settled score changes
- [ ] `selectedChoice := verdictChoice` inside the transaction for settled score changes
- [ ] Overlay settled choices before `calculateBreakdown` / `computeGrade`
- [ ] Tests: score-change-only Cover → `finished`, files intact, Grade reflects correction
- [ ] Tests: mixed Cover → `in_progress`, only the hard reject's files deleted
- [ ] Tests: legacy `rejected` + `verdictChoice` row treated as settled
- [ ] Tests: hard reject unchanged end to end
- [ ] `bun test` green
