# ADR 0010: Resolve a Cover's current status with a correlated `LEFT JOIN LATERAL`

**Status:** Accepted (2026-08-20) · **Amended (2026-08-20, bolt 027)** — see *Amendment* below

**Extends:** the latest-log-wins rule established by ADR-0003 and intent `007-cover-status-filter`, and relied on by intent `011-finished-cover-reward-guard`. The rule is unchanged. This ADR fixes its **SQL form** and requires that form to be shared rather than reimplemented.

## Context

A Cover's current status is the `CoverLogs` row with the greatest serial `id` — never the greatest timestamp. Until now that rule has only ever existed in application code: services fetch a Cover's logs, then pick the latest in JavaScript or via `selectDistinctOn`.

Intent `012-list-pagination` cannot keep it there. Offset pagination requires the database to count and slice the same population the caller asked for, and a filter that runs after the query cannot participate in the predicate the count is computed from. To paginate the Enrollment lists (bolt 026) and the Score Report lists (bolt 027), Cover status must become something a `WHERE` clause can test.

Two properties make this non-trivial:

- **Cover-to-CoverLog is one-to-many.** A naive join multiplies the outer row once per log. A Cover with three logs would return its Enrollment three times — the same row-multiplication defect ADR-0008 removed from the factory lists, reappearing in a new place.
- **The rule is per-row.** "The newest log *for this Cover*" is not a column match; it is a sort-and-take-one scoped to each Cover.

Two bolts need the identical resolution. Without a decision, they write it twice.

## Decision

Resolve current Cover status with a correlated `LEFT JOIN LATERAL`, extracted into a shared module that every caller must import.

```sql
LEFT JOIN LATERAL (
    SELECT cl.status
    FROM   cover_logs cl
    WHERE  cl.cover_id = c.id
    ORDER  BY cl.id DESC
    LIMIT  1
) latest ON true
```

- **`ORDER BY cl.id DESC` is contractual, not incidental.** It is the latest-log-wins rule. Ordering by any timestamp column is wrong and must fail review.
- **`LIMIT 1` is a correctness control, not an optimisation.** It collapses the one-to-many relation to a single row before it can widen the outer result.
- **The resolution lives in `src/service/coverStatus.ts`** and is exported as `latestCoverLogLateral`. Any query needing a Cover's current status imports it. Writing a second correlated subquery over `cover_logs` is a review failure.
- **The helper resolves status only; it does not filter.** Callers' policies differ — the Enrollment lists map four filter values including a `none` absence test, while the Score Report lists select the scorable set (`in_review`, `finished`). Sharing the mechanism is the goal; sharing the policy is not.
- **`none` is not a status.** On the Enrollment lists, `?coverStatus=none` means *the Enrollment has no Cover* and is expressed as `covers.id IS NULL`. It must never be written as `latest.status IS NULL`, which would also match an Enrollment whose Cover exists but has no log yet — a different population.

## Considered options

- **`LEFT JOIN` against an uncorrelated `DISTINCT ON (cover_id)` subquery (rejected).** Returns the correct answer and mirrors the `selectDistinctOn` the application code already uses, so it looks like the natural translation. Rejected because it is uncorrelated: it resolves the latest log for **every Cover in the database** — every province, every region, every past fiscal year — and only then discards the ones outside the caller's page. That is the "compute everything, then discard" shape intent `012` exists to remove; it would fix correctness while preserving the waste.
- **Correlated scalar subquery repeated in `SELECT` and `WHERE` (rejected).** PostgreSQL cannot reference a `SELECT` alias from `WHERE`, so the subquery must be written twice in every query that filters on status. Two copies of the latest-log rule per query, multiplied across six endpoints, is the drift this ADR exists to prevent.
- **Denormalise a `current_status` column onto `Covers`, maintained on write (rejected).** Makes the filter trivial and fast. Rejected because it introduces a second source of truth for a value that is currently always derived, requires a schema change and a migration that intent `012` explicitly forbids, and creates a class of bug — status column disagreeing with the log history — that cannot exist today.
- **Correlated `LEFT JOIN LATERAL`, shared (chosen).** Reads logs only for Covers already in scope, collapses to one row, and the joined alias serves the projection, the filter, and the count from one expression.

## Reasons

- **It is the only option that is both correct and scoped.** The `DISTINCT ON` alternative is correct but unscoped; the scalar subquery is scoped but duplicated.
- **One expression serves projection, filter, and count.** This is what lets the count query and the page query share a single predicate, which is the invariant pagination depends on.
- **`LIMIT 1` puts the anti-multiplication guarantee in one reviewable place** rather than relying on every caller to remember it.
- **Extraction converts a hope into a constraint.** The alternative was a note in bolt 027 asking it to reuse bolt 026's pattern. A note is not a guarantee; an import is.

## Consequences

- **`src/service/coverStatus.ts` becomes a shared dependency of the enrollment and score read paths.** A change to it affects both. That is the intended coupling — it is the same rule — but it means the module needs its own tests rather than relying on each caller's.
- **Review gate**: a second `ORDER BY` over `cover_logs` appearing anywhere outside `coverStatus.ts` should be rejected.
- **Query plans must be measured.** The lateral runs once per candidate Cover. An index on `cover_logs (cover_id, id DESC)` would serve it directly; whether one exists must be confirmed with `EXPLAIN ANALYZE`. Any index addition is raised for human review, never migrated inside a bolt.
- **The count query retains the lateral even when no status filter is applied**, costing one correlated lookup per counted row in that case. Accepted deliberately: a conditional join chain would create two code paths whose predicates could diverge. If measurement shows the cost is material, the lateral is dropped from **both** queries — never from one.
- **Application-side latest-log resolution is not removed everywhere.** Other services still resolve status in JavaScript for non-paginated reads. This ADR does not require a sweep; it requires that any query *filtering or counting* on status uses the shared helper.

---

## Amendment (2026-08-20, bolt 027) — the module owns two shapes, not one

The decision above is unchanged: one definition of a Cover's current status, owned by
`src/service/coverStatus.ts`. Only the inventory of shapes has grown.

As originally written this ADR described a single export, the correlated lateral. Bolt 027 found that
`getScoreByFactory` also resolves current status — with its own `orderBy(desc(coverLogs.id)).limit(1)`
— and that the lateral **cannot** serve it. The two call sites need genuinely different SQL:

| Shape | Question | Form |
|-------|----------|------|
| **A** — many Covers, inside a list query | "for *each* Cover in this list, what is its status?" | `LEFT JOIN LATERAL … ORDER BY id DESC LIMIT 1` — needs a Cover on its left to correlate against |
| **B** — one already-known Cover | "Cover 42 — what is its status?" | standalone `SELECT … WHERE cover_id = ? ORDER BY id DESC LIMIT 1` — no list, nothing to correlate |

Both express greatest-`id`-wins. Only their SQL differs.

`src/service/coverStatus.ts` therefore exports both:

- `latestCoverLogLateral(database)` — shape A (unchanged)
- `latestCoverLogFor(database, coverId)` — shape B (added by bolt 027)

`getScoreByFactory` migrates to shape B, removing the last second definition of current status in the
codebase. Its behaviour is unchanged: same ordering, same `LIMIT 1`, same `in_progress` guard and
`400` response.

### The review gate, restated — and scoped honestly

This ADR's original gate wording — *"a second `ORDER BY` over `cover_logs` appearing anywhere outside
`coverStatus.ts` should be rejected"* — was written as though the codebase already satisfied it. **It
did not, and still does not.** A sweep during bolt 027 found four sites deriving current status
outside this module, not one:

| Site | Shape | Status |
|------|-------|--------|
| `score.ts` `getScoreByFactory` | B | ✅ migrated by bolt 027 |
| `answer.ts:238` | B — write-path guard before an Answer save | ⏳ not migrated |
| `answer.ts:698` | B — write-path guard before an Answer save | ⏳ not migrated |
| `cover.ts:76` | B **plus `updatedAt`** — needs a wider return than `latestCoverLogFor` provides | ⏳ not migrated |

All four are **semantically identical today** — `where cover_id = ? order by coverLogs.id desc limit 1`.
This is duplication, not divergence: there is no correctness defect. The exposure is future-only, and
narrow — if the rule were changed in one place, what would break is the Factory answer-save guard and
the Factory cover read, never a paginated staff list, which reads exclusively through this module.

The three remaining sites were **deliberately not migrated by bolt 027**. `answer.ts` is named in
`docs/handover.md` as a high-coupling change hotspot, its two sites are write-path guards with no
coverage from that bolt's tests, and `cover.ts` needs a variant rather than a mechanical swap. Doing
that work inside a pagination bolt would carry more risk than the duplication it removes.

The gate is therefore scoped to what is actually enforceable today:

> **Reject if a Cover's current status is derived outside `src/service/coverStatus.ts` in the list
> read paths — `score.ts`, `enroll.ts`, `factory.ts`.**

A rule the codebase already violates trains reviewers to skip it, which then fails to catch the next
copy — including one that might land inside a paginated path. A narrower true rule is worth more than
a broader false one.

**Follow-up**: migrating the remaining three, and adding an `updatedAt`-carrying variant for
`cover.ts`, is tracked in the construction log of unit `001-list-pagination`. Widen this gate back to
"anywhere" once that lands.

Bolt 027's own bolt file had carried a stricter, wrongly-phrased variant: *"reject if a second
`coverLogs` ordering appears anywhere in `src/service/score.ts`"*. That rejected pre-existing correct
code, because it constrained the **SQL** rather than the **source of the rule**. It has been reworded
to:

> **Reject if a Cover's current status is derived anywhere outside `src/service/coverStatus.ts`.**

That form is checkable without knowing which shape a call site needs, and it survives a future third
shape.
