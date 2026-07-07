---
stage: model
bolt: 023-change-score-file-deletion
created: 2026-07-07T00:00:00.000Z
---

## Static Model: change-score-file-deletion

This bolt makes **no changes** to entities, aggregates, or events — it reuses the domain model established by intents `003-evaluator-review` / `008-per-answer-verdict-save` in full. The only change is a business **rule** on an existing domain service operation (`finalize`), documented below as a rule delta rather than a new model.

### Entities (unchanged, reused)

- **Answer**: `id`, `coverId`, `questionId`, `selectedChoice`, `fileUrl1_1..fileUrl3_3` — the factory's submitted answer + up to 9 evidence-file slots. This bolt changes *when* `fileUrl*` gets nulled, not the entity shape.
- **AnswerLog**: `id`, `answerId`, `status` (`in_review|recommended|rejected|finished`), `verdictChoice` (`0-3|null`), `description`, `eval_id` — append-only verdict history. Unchanged; this bolt reads it exactly as `finalize` already does.
- **Cover**: `id`, `enrollId` — the whole assessment being reviewed. `coverStatus` derivation (via `coverLogs`) is unchanged by this bolt.

### Value Objects (unchanged, reused)

- **Verdict Decision**: `approve | change_score | reject` — the three shapes of `VerdictSaveBody`. Unchanged.
- **Reviewer Context**: `{ accountId, level, region }` — resolved evaluator or admin-as-national-ODPC identity. Unchanged.

### Aggregates (unchanged, reused)

- **Cover aggregate**: Cover → Answers → AnswerLogs (latest-per-answer). `finalize` is the sole writer of the terminal `coverLogs` transition and the sole deleter of evidence files. Unchanged boundary.

### Domain Events (unchanged, reused)

- **Cover Finalized**: emitted (as `coverLogs` insert + email) when `finalize` completes. Unchanged trigger/payload.

### Domain Services

- **`finalize` (existing service operation, rule changed)**:
  - **Existing rule (pre-bolt)**: an Answer's evidence files are deleted at finalize only if its final `AnswerLog.status === "rejected"` **and** `verdictChoice === null` (hard reject).
  - **New rule (this bolt)**: an Answer's evidence files are deleted at finalize if its final `AnswerLog.status === "rejected"` — **regardless of `verdictChoice`**. A `change_score` outcome (status `rejected`, `verdictChoice` set) now deletes files exactly like a hard reject.
  - **Unaffected sub-rules** (explicitly reused, not touched):
    - Deletion stays deferred to `finalize` only; `saveAnswerVerdict` performs zero file I/O.
    - Deletion executes outside-then-before the DB transaction (abort with `500` pre-write on MinIO failure).
    - `finalize` reads only the *latest* `AnswerLog` per Answer — an Answer re-saved to `approve` before finalize runs is excluded from deletion (no special-casing needed; falls out of the existing read).
    - `hasRejected` (→ `coverStatus` `in_progress` vs `finished`, and grade computation) is **unchanged** — it already treats `change_score` as `rejected` for Cover-outcome purposes; this bolt does not touch that check.
    - Both review surfaces (`evaluators/covers/*`, `admins/covers/*` via `adminReviewerContext`) share this one `finalize` implementation — no new branching.

### Repository Interfaces (unchanged, reused)

- **AnswerLog repository** (via Drizzle `selectDistinctOn`): latest-log-per-answer read. Unchanged query shape.
- **File repository** (`utilities().deleteFileStrict`): unchanged interface; called for a wider input set.

### Ubiquitous Language

- **Hard reject**: an evaluator's `reject` decision with no suggested replacement score (`verdictChoice: null`). Pre-bolt: the only trigger for file deletion at finalize.
- **Change-score**: an evaluator's `change_score` decision (`verdictChoice` set to a lower/different tier). Pre-bolt: preserved files at finalize. **Post-bolt: also deletes files at finalize** — this bolt collapses the hard-reject/change-score distinction for the *file-deletion* rule only. The distinction still exists for logging/authorship purposes (`verdictChoice` is still recorded either way).
- **Rejected-at-finalize** (new term, this bolt): the union of hard-reject and change-score outcomes — the set an Answer must NOT be in for its files to survive finalize. Replaces the old narrower term "hard-reject" when referring to the file-deletion predicate specifically (code-level rename: `hardRejectIds` → `rejectedAnswerIds` or similar).

---

## Stories Covered

- **001-widen-finalize-file-deletion**: covered by the `finalize` rule change above.
- **002-regression-coverstatus-and-surface-parity**: covered by the "Unaffected sub-rules" list — `hasRejected`/coverStatus/grade and both-surface parity are explicitly called out as unchanged, giving the test stage a clear regression checklist.
