---
intent: 013-fiscal-year-addressing
phase: inception
status: units-decomposed
updated: 2026-08-20T08:55:00Z
---

# Fiscal Year Addressing - Unit Decomposition

## Project Type

`backend-api`, using the catalog's domain-driven backend decomposition and
`ddd-construction-bolt`. No frontend unit is created; the frontend is an external consumer that
adopts the `fiscalYear` parameter and owns Buddhist Era presentation.

## Units Overview

This intent contains two backend units. They correspond to the two distinct capabilities the user
separated during Checkpoint 1b: **addressing** (reading a nominated year) and **continuity**
(advancing work across the boundary).

### Unit 1: `001-fiscal-year-reads`

**Description**: Turn fiscal year from an implicit property of "now" into an explicit, parameterised
read dimension. Replace the ambient derivation with a resolver that accepts a target year, reads the
clock once, and pins boundaries to `Asia/Bangkok`; then thread that resolver through every
fiscal-scoped read path and surface the resolved year on the way out.

**Assigned Requirements**: FR-1, FR-2, FR-3, FR-8

**Deliverables**:

- A parameterised, single-clock, timezone-pinned fiscal-year resolver replacing the current
  two-`new Date()` host-local implementation, with all sixteen existing call sites unchanged.
- A shared `fiscalYear` query-parameter schema, composed into existing route query schemas.
- Fiscal-year addressing on the staff list paths: Enrollment, Factory, and Score Report.
- Fiscal-year addressing on the Factory self-read paths: enrollment, cover, answers, and score.
- The Common Era `fiscalYear` present on fiscal-scoped read responses.
- Boundary coverage at Sep 30 23:59:59 and Oct 1 00:00:00 Bangkok, including leap years, and
  host-timezone independence coverage.

**Dependencies**:

- Existing pagination contract from intent `012-list-pagination`, whose `PaginationQuery` composition
  pattern the `fiscalYear` parameter follows and whose nine list endpoints it extends.
- Existing Cover-status filter from intent `007-cover-status-filter`, preserved unchanged.
- Existing Score Report capability from intent `001-score-calculator-and-report`.
- All three are complete; no active bolt is blocked.

**Estimated Complexity**: Medium

### Unit 2: `002-out-of-year-writes`

**Description**: Introduce the right to write a fiscal year that is not the current one. Two
non-expiring authorities — DOED and ODPC-level Evaluators — plus a 31-day Factory grace window for
finishing a Cover that was already in flight at the boundary. Resolve what a Factory holding two
open years reads by default, and define expiry as a change in who may write rather than a change in
Cover state.

**Assigned Requirements**: FR-4, FR-5, FR-6, FR-7

**Deliverables**:

- New evaluator-level-scoped middleware, expressing a distinction no existing guard can make.
- Past-fiscal-year write authority for `Role.DOED` and `Role.Evaluator` at level `ODPC`,
  region-scoped and non-expiring.
- A single declared grace-window policy (2026-10-01 → 2026-10-31 inclusive) resolved in one place.
- Grace-window Cover completion for Factories: answer save, answer update, and Cover submission.
- Unambiguous self-read resolution while a Factory holds both a grace-window year and a current year.
- Distinct, logged refusals for unauthorised out-of-year writes, and actor attribution on every
  granted one.

**Dependencies**:

- Depends on: `001-fiscal-year-reads`. The grace window, the write-authority check, and the
  concurrent-year disambiguation all consume the FR-1 resolver, and the self-read behaviour this
  unit disambiguates is built in Unit 1.
- Existing per-answer verdict behaviour from intent `008-per-answer-verdict-save` and the
  finished-Cover reward guard from `011-finished-cover-reward-guard`, both preserved unchanged.

**Estimated Complexity**: Medium

## Requirement-to-Unit Mapping

- **FR-1** Parameterised, deterministic fiscal-year derivation → `001-fiscal-year-reads`
- **FR-2** Fiscal year as an explicit read parameter → `001-fiscal-year-reads`
- **FR-3** Historical reads honour existing role scope → `001-fiscal-year-reads`
- **FR-8** Fiscal year surfaced in responses → `001-fiscal-year-reads`
- **FR-4** Past-fiscal-year write authority → `002-out-of-year-writes`
- **FR-5** Factory grace window for unfinished prior-year Covers → `002-out-of-year-writes`
- **FR-6** Concurrent open years → `002-out-of-year-writes`
- **FR-7** Grace window expiry disposition → `002-out-of-year-writes`

## Unit Dependency Graph

```text
001-score-calculator-and-report (complete) ─┐
007-cover-status-filter (complete) ─────────┼─> 001-fiscal-year-reads ──> 002-out-of-year-writes
012-list-pagination (complete) ─────────────┘                                    ▲
                                                                                 │
008-per-answer-verdict-save (complete) ──────────────────────────────────────────┤
011-finished-cover-reward-guard (complete) ──────────────────────────────────────┘
```

## Execution Order

1. `001-fiscal-year-reads` — three sequenced bolts. The resolver must land before anything consumes it.
2. `002-out-of-year-writes` — three sequenced bolts, after Unit 1's self-read behaviour exists.

Both units must be released before 2026-10-01.

## Why Two Units

The decisive criterion in this project is deployability, and here it genuinely separates the work.

Unit 1 is entirely additive: an optional parameter, a resolver refactor with no behavioural change
when called without arguments, and an extra response field. It is independently deployable and
independently valuable — shipping it alone satisfies the "no user-visible dark period" business
goal, because every role could still *see* FY2026 after rollover.

Unit 2 changes who may mutate what, and when. It carries the authorization risk of the intent: a new
guard, a time-bounded permission, and a Factory write path reaching into a closed year. It is
separately releasable and separately reviewable, and it serves a different actor set — the two
write authorities and the Factory in grace — under different rules.

This split also gives the intent a defensible trim point against a fixed external date. If schedule
pressure appears, Unit 1 alone still prevents the blackout; Unit 2 alone would not, since addressing
must exist before out-of-year writes can be targeted at anything.

Contrast with `012-list-pagination`, which was deliberately kept as one unit because its nine
endpoints changed response shape simultaneously and could not ship apart. Nothing here has that
property — every change in this intent is backward compatible on its own.

## Note on FR-6

FR-6 (concurrent open years) is assigned to Unit 2 because the condition it resolves — a Factory
holding two open fiscal years at once — exists only as a consequence of the grace window. Its
implementation, however, touches the Factory self-reads built in Unit 1. Unit 2's bolt sequence
accounts for this: the disambiguation story is scheduled after the grace-window story, so the
behaviour being disambiguated is real before it is constrained.
