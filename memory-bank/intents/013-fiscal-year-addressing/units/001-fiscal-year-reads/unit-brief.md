---
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
phase: inception
status: ready
created: 2026-08-20T08:55:00Z
updated: 2026-08-20T08:55:00Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: Fiscal Year Reads

## Purpose

Make the fiscal year an explicit, addressable dimension of every fiscal-scoped read. Replace the
ambient "now" derivation with a resolver that accepts a target Common Era year, reads the clock once,
and pins its boundaries to `Asia/Bangkok`; thread it through the staff list paths and the Factory
self-read paths; and return the resolved year with the data so no client infers it from a date.

Because this intent adds no persisted fiscal-year column, this resolver *is* the fiscal-year
contract. Every historical read in the system will derive its own boundary through it.

## Scope

### In Scope

- Parameterising `utilities().getFiscalYear()` to accept an optional CE fiscal year, defaulting to
  the current one, with all sixteen existing call sites unchanged and uncompiled-against.
- Removing the two-`new Date()` rollover race and the host-`TZ` dependency from that derivation.
- A helper resolving which fiscal year a given instant belongs to.
- A shared `fiscalYear` query-parameter schema composed into existing route query schemas, following
  the `PaginationQuery` pattern from `012-list-pagination`.
- Fiscal-year addressing on the Enrollment, Factory, and Score Report staff lists, in all their
  role-scoped variants.
- Fiscal-year addressing on the Factory self-reads: enrollment, cover, answers, and score.
- The Common Era `fiscalYear` on fiscal-scoped read responses.
- Boundary, leap-year, and host-timezone-independence coverage.

### Out of Scope

- Any write path. All writes remain current-fiscal-year-only; out-of-year writes belong to
  `002-out-of-year-writes`.
- Any database schema change: no column, index, constraint, or enum value. Fiscal-year identity is
  not persisted by this unit or any other in this intent.
- Backfill, migration, duplicate resolution, or any cutover step.
- Buddhist Era conversion, which the frontend owns.
- Cross-year reporting, year-over-year comparison, and bulk export.
- Changing pagination, existing filters, role guards, or region and province scoping.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Parameterised, deterministic fiscal-year derivation | Must |
| FR-2 | Fiscal year as an explicit read parameter | Must |
| FR-3 | Historical reads honour existing role scope | Must |
| FR-8 | Fiscal year surfaced in responses | Should |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| Fiscal Year | Half-open interval `[Oct 1 of Y-1 00:00, Oct 1 of Y 00:00)` in `Asia/Bangkok`, labelled by its ending Common Era year. FY2026 = 2025-10-01 → 2026-09-30. | CE integer |
| Fiscal Year Window | The resolved `{ fiscalYearStart, fiscalYearEnd }` pair a query filters by. Produced only by the resolver. | start, end |
| Enrollment | Sole carrier of fiscal-year identity, via `enroll_date`. Not modified by this unit. | `Enrolls.enroll_date` |

### Ubiquitous Language

- **Address a fiscal year** — name a year explicitly on a request, rather than receiving the current
  one implicitly.
- **Current fiscal year** — the year containing the present instant; what an omitted parameter means.
- **Resolve** — convert a CE year, or the absence of one, into a window. Only the resolver resolves.

## Key Seams

- `src/utils.ts:54-64` — `getFiscalYear`. The single point of change for FR-1.
- `src/schema/pagination.ts:32` — the composition pattern the `fiscalYear` parameter follows.
- `src/service/enroll.ts:91,156,317,518`, `src/service/cover.ts:10,50`,
  `src/service/answer.ts:15,216,350,397,676`, `src/service/score.ts:126,177`,
  `src/service/factory.ts:51` — the sixteen consumers.
- The Factory-facing routes under `src/routes/factories/`, and the staff list routes under
  `src/routes/admins/`, `src/routes/evaluators/`, `src/routes/provincialOfficers/`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Changing boundary computation shifts which rows fall in the current year | Silent data-set change on live endpoints | Deployed containers already set `TZ=Asia/Bangkok` (`docker-compose.yaml:30`), so pinning is a no-op in production config. Prove it with tests asserting identical results under `TZ=UTC` and `TZ=Asia/Bangkok`. |
| Off-by-one in the year label | Every historical read silently returns the wrong year | The canonical definition is normative in `requirements.md`; assert FY2026 = 2025-10-01 → 2026-09-30 directly in the resolver's tests before anything consumes it. |
| A service hand-rolls a window instead of calling the resolver | Two derivations that can disagree | `CLAUDE.md` already forbids this. Review every touched service for direct date construction. |
| `total` and page disagree when `fiscalYear` is applied | Pagination correctness regression from `012` | Count query and page query must share the identical predicate, including the resolved window. |
