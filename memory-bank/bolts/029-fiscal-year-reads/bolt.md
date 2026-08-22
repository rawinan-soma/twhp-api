---
id: 029-fiscal-year-reads
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
type: ddd-construction-bolt
status: planned
stories:
  - 001-fiscal-year-resolver
  - 002-fiscal-year-query-contract
created: 2026-08-20T08:55:00Z
started: null
completed: null
current_stage: null
stages_completed: []
requires_bolts: []
enables_bolts:
  - 030-fiscal-year-reads
  - 031-fiscal-year-reads
  - 032-out-of-year-writes
requires_units: []
blocks: true
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 1
  testing_scope: 3
---

# Bolt: 029-fiscal-year-reads

## Overview

Establish the fiscal-year contract: a resolver that accepts a target Common Era year, and a shared
query parameter that carries one from the wire.

## Objective

Replace the ambient, host-local, twice-read-the-clock derivation in `src/utils.ts:54-64` with a
parameterised, single-clock, `Asia/Bangkok`-pinned resolver — without editing any of its sixteen
callers — and define the `fiscalYear` query schema that will be composed into routes by bolt 030.

## Stories Included

- **001-fiscal-year-resolver**: Parameterised, deterministic fiscal-year derivation (Must)
- **002-fiscal-year-query-contract**: Shared optional `fiscalYear` query parameter (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model** → `ddd-01-domain-model.md`
- [ ] **2. Technical Design** → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis** → the timezone-pinning and no-persisted-identity decisions are candidates
- [ ] **4. Implement**
- [ ] **5. Test** → `ddd-03-test-report.md`

## Dependencies

### Requires

- None. Foundation bolt of the intent.

### Enables

- **030-fiscal-year-reads**: needs both the resolver and the query schema
- **031-fiscal-year-reads**: boundary coverage tests the resolver directly
- **032-out-of-year-writes**: grace-window and authority checks consume the resolver

## Expected Outputs

- `utilities().getFiscalYear(fiscalYear?)` returning the window for a nominated CE year, defaulting
  to the current one, with an unchanged `{ fiscalYearStart, fiscalYearEnd }` shape.
- A helper answering which fiscal year contains a given instant.
- A time seam allowing boundary instants to be exercised in tests.
- A shared `fiscalYear` query schema following `src/schema/pagination.ts`, with `t.Numeric`,
  `multipleOf: 1`, and a declared range.
- Contract tests asserting FY2026 = 2025-10-01 → 2026-09-30 and host-timezone independence.

## Success Criteria

- [ ] Both stories satisfy every acceptance criterion.
- [ ] All sixteen existing `getFiscalYear()` call sites compile and pass **without edit**.
- [ ] Exactly one clock read per resolution; the two-`new Date()` race is gone.
- [ ] Identical results under `TZ=UTC` and `TZ=Asia/Bangkok`, proven by test.
- [ ] An out-of-range or fractional year is rejected before any date arithmetic.
- [ ] No database schema change of any kind.
- [ ] Non-mutating Biome diagnostics reported as baseline versus introduced findings.
- [ ] Code and artifacts reviewed.

## Notes

This bolt carries more weight than its size suggests. Because the intent persists no fiscal-year
column, **this resolver is the fiscal-year contract for the entire system** — every historical read
that ever runs will derive its boundary here.

Two things deserve deliberate attention rather than a quick decision. First, the time seam: if the
resolver reads the clock directly with no injection point, story 006's boundary assertions cannot be
written at all, so the seam is a requirement of this bolt and not a testing convenience discovered
later. Second, pinning to `Asia/Bangkok` is a no-op under deployed configuration — every container
already sets `TZ=Asia/Bangkok` (`docker-compose.yaml:30`) — but it is only a no-op if that is
verified rather than assumed.

The canonical definition in `requirements.md` is normative: fiscal year `Y` is labelled by its
**ending** year. Assert it before anything consumes the resolver. An off-by-one here would mislabel
every historical read in the system, and nothing downstream would catch it.
