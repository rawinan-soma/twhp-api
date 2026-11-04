---
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
phase: inception
status: ready
created: 2026-08-20T08:55:00Z
updated: 2026-08-20T08:55:00Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: Out-of-Year Writes

## Purpose

Introduce the right to write a fiscal year that is not the current one, and give Factories a bounded
opportunity to finish work that was already in flight when the boundary passed.

Today every write path is current-year-scoped, so at 2026-10-01 an unfinished Cover becomes
permanently unadvanceable by anyone. This unit grants two non-expiring authorities — DOED and
ODPC-level Evaluators — and one expiring one: a 31-day Factory grace window for Cover completion.

This is the authorization-bearing half of the intent, and the half that addresses the originating
concern: Factories and evaluators who will not have completed FY2026 by the deadline.

## Scope

### In Scope

- New evaluator-level-scoped middleware, distinguishing `ODPC` from `Mental` and `DOH`.
- Past-fiscal-year write authority for `Role.DOED` and `Role.Evaluator` at level `ODPC`, retaining
  each actor's existing scope and never expiring.
- A single declared grace-window policy value — 2026-10-01 → 2026-10-31 inclusive — resolved in one
  place rather than repeated across services.
- Grace-window Cover completion for Factories: answer save, answer update, and Cover submission
  (`in_progress → in_review`).
- Unambiguous self-read resolution while a Factory holds a grace-window year and a current year
  simultaneously.
- Distinct, logged refusals for unauthorised out-of-year writes; actor attribution on granted ones.

### Out of Scope

- Any database schema change. In particular, no `expired` value is added to the `coverStatus` enum
  (`src/drizzle/schema.ts:296`); a Cover unfinished at window close simply stays `in_progress`.
- Any scheduled job, sweep, or migration touching expired Covers. Grace is evaluated at write time.
- Prior-year enrollment creation or editing. Closed-year enrollment data stays immutable to its owner.
- Reopening a Cover that has already reached `finished`.
- Widening ODPC authority beyond its existing region scope.
- Notifications of any kind — rollover, window opening, or window expiry.
- Changing scoring: `SCORABLE_STATUSES` already excludes `in_progress` (`src/service/score.ts:26`).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-4 | Past-fiscal-year write authority | Must |
| FR-5 | Factory grace window for unfinished prior-year Covers | Must |
| FR-6 | Concurrent open years | Must |
| FR-7 | Grace window expiry disposition | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| Write Authority | The right to mutate a nominated fiscal year. Current-year authority is universal and unchanged; past-year authority is held only by DOED and ODPC, and does not expire. | role, evaluator level, region |
| Grace Window | A bounded interval after rollover during which a Factory may still complete an unfinished prior-year Cover. 2026-10-01 → 2026-10-31 inclusive. | start, end |
| Evaluator Level | `Mental` \| `DOH` \| `ODPC` on `Evaluators`. Not a `Role`; no existing guard reads it. | level |
| Expiry | The lapse of Factory grace. A change in who may write, never a change in Cover state. | — |

### Ubiquitous Language

- **Out-of-year write** — a mutation targeting a fiscal year other than the current one.
- **Grace window** — the Factory's bounded, expiring authority. Distinct from DOED/ODPC authority,
  which never expires.
- **Expiry** — the end of the grace window. Does not mutate, sweep, or mark anything.
- **Concurrent open years** — a Factory legitimately holding a grace-window Cover and a new-year
  enrollment at the same time.

## Key Seams

- `src/middleware/guards.ts:12` — `evalGuard`, which admits all evaluator levels and cannot express
  FR-4; the new level-scoped guard is composed alongside it.
- `src/middleware/rbac.ts` — `requireRoles`, the composition pattern the new guard follows.
- `src/drizzle/schema.ts:13,24` — `evaluatorLevels` and the `Evaluators.level` column the guard reads.
- `src/service/answer.ts:344` — the Factory submission transition `in_progress → in_review`, the
  central grace-window write path.
- `src/service/answer.ts:15,216,350,397,676` — the answer write paths requiring year authorisation.
- `src/service/cover.ts:30-33` — the duplicate-Cover check, keyed on `enroll_id`, which already
  permits a correct new-year Cover.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| The grace window is expressed as a literal in more than one service | The window moves in one place and not another; a Factory is admitted by one path and refused by the next | One declared policy value, resolved centrally. Named explicitly in FR-5's acceptance criteria. |
| A `.limit(1)` self-read returns the grace-year row where the current year was meant | A Factory sees or edits the wrong year's data during October | FR-6. Self-reads default to the current year; the grace year is reachable only by explicit `fiscalYear`. |
| Grace scope leaks from Cover completion into enrollment editing | Closed-year enrollment data becomes mutable, contradicting the Checkpoint 2 decision | Enrollment create and update paths are explicitly excluded and tested for refusal. |
| Out-of-year refusals are indistinguishable from existing 404s | Cannot tell a permission failure from a missing record in support or logs | FR-4 requires a distinct, logged response, kept separable from the wrong-region 404. |
| ODPC authority is implemented as role-level rather than level-scoped | `Mental` and `DOH` evaluators silently gain past-year write access | The new guard reads `evaluators.level`; refusal of `Mental` and `DOH` is an explicit acceptance criterion. |
| Grace logic is evaluated against host-local time | The window opens or closes an hour early or late | Consumes the Unit 1 resolver, which is single-clock and `Asia/Bangkok`-pinned. |
