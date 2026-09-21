---
intent: 013-fiscal-year-addressing
created: 2026-08-20T07:58:01Z
completed: null
status: in-progress
---

# Inception Log: 013-fiscal-year-addressing

## Overview

**Intent**: Make fiscal year a stored, addressable domain concept rather than a query-time derivation.
**Type**: brown-field
**Created**: 2026-08-20

## Artifacts Created

| Artifact | Status | File |
|----------|--------|------|
| Requirements | ✅ approved at Checkpoint 2 | requirements.md |
| System Context | ✅ | system-context.md |
| Units | ✅ | units.md, units/*/unit-brief.md |
| Stories | ✅ | units/*/stories/*.md (12) |
| Bolt Plan | ✅ | memory-bank/bolts/029–034 (6) |

## Summary

| Metric | Count |
|--------|-------|
| Functional Requirements | 8 |
| Non-Functional Requirements | 5 groups (Compatibility, Derivation correctness, Performance, Auditability, Security) |
| Units | 2 |
| Stories | 12 |
| Bolts Planned | 6 (029–034) |

## Units Breakdown

| Unit | Stories | Bolts | Priority |
|------|---------|-------|----------|
| 001-fiscal-year-reads | 6 | 3 (029, 030, 031) | Must |
| 002-out-of-year-writes | 6 | 3 (032, 033, 034) | Must |

## Decision Log

| Date | Decision | Rationale | Approved |
|------|----------|-----------|----------|
| 2026-08-20 | Scope as an intent, not a query-param patch | A `?fiscalYear=` parameter over a derived value re-derives the BR-06 ambiguous boundary on every historical read, permanently baking today's timezone uncertainty into history. Stored identity is the prerequisite. | Yes |
| 2026-08-20 | Store and expose fiscal year as **CE**; frontend renders BE | Single canonical representation in DB and API contract; `enrollDate.getFullYear()` is already CE so no conversion at the boundary. BE (+543) is a presentation concern. | Yes |
| 2026-08-20 | History is readable by **all roles**, within existing scope | Factories reading their own prior-year score is the expected product behaviour; existing role scoping (own / province / region / national) is reused unchanged rather than inventing a history-specific authorization model. | Yes |
| 2026-08-20 | Past-year **writes** restricted to `Role.DOED` and `Role.Evaluator` level `ODPC` | Limits mutation of closed years to the two authorities accountable for them. Note: `evaluatorLevels` (`Mental`/`DOH`/`ODPC`, `src/drizzle/schema.ts:13`) is a level on `Evaluators`, not a `Role`; `evalGuard` today admits all evaluator levels, so a **new level-scoped guard** is required. | Yes |
| 2026-08-20 | Fiscal-year addressing is open-ended past and future | No retention horizon or archival cutoff; future years become addressable as they arrive. Avoids a policy the domain has not asked for. | Yes |
| 2026-08-20 | Fiscal year is labelled by its **ending CE year** (FY2026 = Oct 2025 – Sep 2026) | Matches Thai convention (ปีงบประมาณ 2569 ends Sep 2026) so `fiscalYear + 543` is a correct BE render. Off-by-one here corrupts the backfill irreversibly, so it is stated normatively in requirements. | Yes |
| 2026-08-20 | Factories get a **bounded grace window** to finish prior-year Covers | Read-addressing alone leaves the originating concern unsolved: DOED/ODPC past-year write authority rescues stalled *reviews*, but cannot supply a Factory's unsubmitted answers. Grace closes that half. | Yes |
| 2026-08-20 | Grace covers **Cover completion only** — not enrollment create/edit | Keeps closed-year enrollment data immutable while still allowing the assessment to finish. | Yes (assumption, confirm at CP2) |
| 2026-08-20 | `Enrolls` is the **sole owner** of fiscal-year identity | `Covers`/`Answers`/scores reach it in one hop via `covers.enroll_id`. Avoids denormalised copies that can disagree. | Yes |
| 2026-08-20 | Full intent ships **before 2026-10-01** | User decision. No user-visible dark period at the boundary. | Yes |
| 2026-08-20 | **No database schema changes** — no columns, indexes, constraints, or enum values | User constraint at Checkpoint 2. Fiscal year stays derived at query time from `Enrolls.enroll_date`. | Yes |
| 2026-08-20 | Derivation correctness becomes the contract → FR-1 promoted to keystone | Without stored identity, every historical read re-derives its own boundary. The existing helper reads the clock twice (`src/utils.ts:55-56`) and inherits host `TZ`. Parameterising it while making it single-clock and explicitly `Asia/Bangkok` is the only available mitigation for BR-06. | Yes |
| 2026-08-20 | Duplicate handling downgraded from constraint to **read-only survey** | A unique index is a schema change. Duplicates, if any, become a data decision rather than a migration blocker. | Yes |
| 2026-08-20 | FR-7 expiry disposition constrained to existing `coverStatus` values | `coverStatus` pgEnum is fixed at `finished`/`in_progress`/`in_review` (`src/drizzle/schema.ts:296`); adding `expired` would be a schema change. Default disposition is to leave the Cover `in_progress`. | Yes |
| 2026-08-20 | Grace window confirmed at **31 days**, 2026-10-01 → 2026-10-31 inclusive | User decision at Checkpoint 2. Expressed relative to the rollover boundary, not as literal 2026 dates, so the rule recurs each year without edit. | Yes |
| 2026-08-20 | Grace confirmed as **Cover completion only** | User decision at Checkpoint 2. Closed-year enrollment data stays immutable to its owner. | Yes |
| 2026-08-20 | ODPC past-year authority confirmed **region-scoped** | User decision at Checkpoint 2. Authority over a closed year does not widen geographic reach. | Yes |
| 2026-08-20 | Expired Covers confirmed to **remain `in_progress`** | User decision at Checkpoint 2. Expiry is a change in who may write, not a change in Cover state — so no sweep, no job, no persisted marker, and no invented substitute status. | Yes |
| 2026-08-20 | **Two units**, not one — addressing separated from continuity | Deployability is this project's decisive criterion. Unit 1 is wholly additive and independently valuable: shipped alone it prevents the blackout. Unit 2 carries the authorization risk and serves different actors. Contrast `012-list-pagination`, kept as one unit because its nine endpoints had to ship together; nothing here has that property. | Yes |

## Scope Changes

| Date | Change | Reason | Impact |
|------|--------|--------|--------|

## Origin

Raised during a Master Agent Q&A on fiscal-year rollover behaviour. Findings that motivated it:

- `getFiscalYear()` is recomputed per request; no rollover job, archival step, or flag exists
  (only scheduled job is the 8:30 AM daily email, `src/workers.ts:9`).
- At Oct 1, prior-year rows remain in PostgreSQL but become unreachable through every read path.
  Factory reads return `no enrollment found` / 404; staff lists return `meta.total: 0`.
- In-flight Covers are not frozen or finalised at the boundary — an assessment mid-review simply
  goes dark.
- Zero occurrences of `fiscalYear` in `src/schema/` or `src/routes/` — the year is not addressable.
- `Enrolls` has no fiscal-year column, so BR-07 cannot be enforced by a unique index and the
  BR-06 boundary ambiguity is re-derived on every query.

**Timing note**: at creation, the FY2026 (CE) window closes 2026-10-01 — approximately 6 weeks out.

## Open Scope Fork (Checkpoint 1b)

The stated primary concern is **not** addressability: it is that some Factories and evaluators will not
have completed FY2026 work before the 2026-10-01 boundary.

Read-addressing does not solve this. It makes stranded work **visible**; it does not make it
**completable**. The two problems are distinct:

- **A — Addressing**: any role can *read* a nominated fiscal year within its existing scope.
- **B — Continuity**: unfinished prior-year work can still be *advanced to completion* after rollover.

The resolved past-year write rule (DOED + ODPC only) supplies continuity for **staff** work —
review and scoring can proceed on a FY2026 Cover after rollover. It does **not** supply continuity
for **Factory** work: a Cover left at `in_progress` because the Factory never submitted its answers
cannot be rescued by DOED or ODPC, because the missing input is the Factory's own.

**Resolved at Checkpoint 1b**:

- (i) Factories **may** complete prior-year work, within a bounded grace window → FR-7.
- (ii) The **full** intent ships before 2026-10-01 → no phased split into a follow-on intent.

Consequence: this intent is both A (addressing) and B (continuity).

## Scope Change — Checkpoint 2 (no schema changes)

The no-schema-change constraint removed three requirements from the draft and reshaped the intent
from a persistence migration into an application-layer change:

**Removed**: stored `fiscal_year` column; backfill of existing rows; unique index on
`(factory_id, fiscal_year)`.

**Accepted consequences**:

- BR-06 boundary ambiguity is re-derived on every historical read rather than resolved once.
  Mitigated, not eliminated, by FR-1 (explicit `Asia/Bangkok`, single clock read).
- BR-07 remains application-only; `.limit(1)` owner lookups stay nondeterministic where duplicates
  exist. Duplicate detection becomes a read-only survey.
- Fiscal filters remain sequential scans — **status quo**, since `Enrolls` carries only
  `enrolls_id_key` on the PK (`src/drizzle/schema.ts:229`). No `enroll_date` or `factory_id` index
  exists today, so no regression is introduced.

**Net effect on delivery**: materially *reduced* risk against the fixed 2026-10-01 date. No
migration, no backfill, no cutover step — the change is additive at the service and route layers,
and the former critical path (duplicate survey gating a constraint) is gone.

## Ready for Construction

**Checklist**:
- [x] All requirements documented
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [ ] Human review complete — Checkpoint 3

## Migrated to FIRE — 2026-08-20T09:10:00Z

This intent was migrated to the FIRE flow at `.specs-fire/intents/fiscal-year-addressing/` before
Checkpoint 3 was signed off. Execution now proceeds under FIRE (Intent → Work Item → Run), not under
AI-DLC bolts.

The 6 planned bolts map 1:1 onto 6 FIRE work items; the 12 stories fold in as acceptance criteria.
The unit layer has no FIRE equivalent and is preserved through the dependency graph instead. See
`.specs-fire/maintenance-log.md` for the full mapping.

**These artifacts remain the authoritative record of how the decisions were reached** — the two
checkpoint reviews, the no-schema-change scope change, and the accepted limitations. They are not
superseded, only no longer the execution plan.

## Next Steps (superseded — see FIRE)

1. ~~Checkpoint 3 — human review of the generated artifacts~~
2. Checkpoint 4 — confirm ready for Construction
3. Begin Construction with bolt `029-fiscal-year-reads`:
   `/specsmd-construction-agent --unit="001-fiscal-year-reads"`

## Dependencies

Execution order follows the unit dependency graph in `units.md`:

```text
029 ──> 030 ──> 031          (unit 001-fiscal-year-reads)
 │       │
 │       └──────────────┐
 └──> 032 ──> 033 ──> 034    (unit 002-out-of-year-writes)
```

`029` blocks everything — it produces the resolver every other bolt consumes. `032` blocks the rest
of unit 2. `034` requires both `030` and `033`, because it constrains self-reads built in one using
the grace window built in the other.

All six must be released before 2026-10-01.
