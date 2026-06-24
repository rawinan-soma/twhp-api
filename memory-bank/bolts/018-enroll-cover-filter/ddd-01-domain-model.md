---
stage: model
bolt: 018-enroll-cover-filter
created: 2026-06-24T06:40:22Z
---

## Static Model: enroll-cover-filter

This is a read-only query feature. The "domain model" describes the existing
entities involved and the read-side concepts the feature introduces
(a status filter value object + an enrichment domain service). No new persistent
entities, no domain events, no writes.

### Entities

- **Enroll**: A factory's enrollment for a fiscal year.
  - Properties: `id`, `factoryId`, `enrollDate`, standards flags, safety-officer fields, … (existing).
  - Business rules: scoped to the current fiscal year (Oct 1 – Sep 30) in all list queries; joined to `factories`/`provinces` to expose `factory_name_th`, `region`, `provinceId`.
  - **New (read-side projection)**: each Enroll, when listed, is projected with `coverId` and `coverStatus` derived from its Cover.

- **Cover**: The assessment cover belonging to an Enroll.
  - Properties: `id`, `enrollId` (existing).
  - Business rules: **at most one Cover per Enroll per fiscal year** (enforced at creation). An Enroll may have **zero** Covers (not started).

- **CoverLog**: An append-only status-history row for a Cover.
  - Properties: `id`, `coverId`, `status` ∈ {`finished`, `in_progress`, `in_review`}.
  - Business rules: the Cover's **current status is the latest row** (highest `id`) — "latest-log-wins". A Cover always has ≥1 CoverLog from creation.

### Value Objects

- **CoverStatusFilter**: The optional request-side filter value.
  - Allowed values: `finished` | `in_progress` | `in_review` | `none`.
  - Constraints: immutable; equality by value; `finished|in_progress|in_review` match a Cover's current status; `none` matches **absence of a Cover**. Any other value is invalid (→ rejected at the boundary).
  - Absent (undefined) ≠ `none`: absent means "no filtering"; `none` means "only enrolls without a cover".

- **EnrollCoverProjection**: The read-model fields added to each listed Enroll.
  - Properties: `coverId: number | null`, `coverStatus: ('finished'|'in_progress'|'in_review') | null`.
  - Constraints: both null together (no Cover); otherwise both populated. `none` has **no** stored counterpart — it surfaces as `coverStatus: null`.

### Aggregates

- **Enroll (aggregate root)**: Members: its Cover (0..1) and that Cover's CoverLogs.
  - Invariant: the Enroll's projected status is the latest-log status of its single Cover, or null when no Cover exists. Read-only — this bolt never mutates the aggregate.

### Domain Events

- None. This is a query-only feature; no state transitions occur.

### Domain Services

- **EnrollCoverEnrichment**: Projects a set of Enrolls with their cover status.
  - Operations:
    - `enrich(enrolls)` → attach `{ coverId, coverStatus }` to each, using latest-log-wins over the set (bounded queries, no N+1).
    - `applyFilter(enrolls, filter)` → when `filter` present, keep only matches: a real status matches `coverStatus === filter`; `none` matches `coverId === null`. AND-combined with the caller's existing scope (region/province) + fiscal year — never widens it.
  - Dependencies: Enroll/Cover/CoverLog read repositories.

### Repository Interfaces

- **EnrollListRepository** (existing, extended):
  - `listAll(scope)` — fiscal-year + optional region/province scope (existing `getAllEnrolls` / `getAllEnrollsByProvince`).
  - **New**: accept an optional `coverStatus` and return enrolls enriched + filtered.
- **CoverByEnrollRepository** (read): `coversForEnrollIds(ids)` → map `enrollId → coverId`.
- **LatestCoverLogRepository** (read): `latestStatusForCoverIds(ids)` → map `coverId → status` (selectDistinctOn + desc id).

### Ubiquitous Language

- **Enroll**: A factory's fiscal-year participation record.
- **Cover**: The assessment instance for an enroll (≤1 per enroll/FY).
- **Cover status**: The latest CoverLog status of an enroll's cover — one of `finished | in_progress | in_review`.
- **No-cover / `none`**: An enroll that has not started an assessment (no Cover); projected as `coverStatus: null`, matched by the `none` filter value.
- **Latest-log-wins**: The rule that a cover's effective status is its highest-`id` CoverLog row.
- **Scope**: The caller's existing visibility — admin = all, evaluator = health region, provincial = province — always AND-combined with any cover filter.

---

## Story Coverage

- **001-cover-status-derivation-and-filter** → `EnrollCoverEnrichment` (enrich + applyFilter), latest-log-wins, no-cover handling, `none`.
- **002-enroll-cover-response-schema** → `EnrollCoverProjection` value object (the `coverId`/`coverStatus` fields).
- **003-enroll-routes-coverstatus-param** → `CoverStatusFilter` value object at the request boundary (allowed values; invalid → rejected).
