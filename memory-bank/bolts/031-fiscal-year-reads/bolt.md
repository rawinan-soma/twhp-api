---
id: 031-fiscal-year-reads
unit: 001-fiscal-year-reads
intent: 013-fiscal-year-addressing
type: ddd-construction-bolt
status: planned
stories:
  - 006-fiscal-year-boundary-coverage
created: 2026-08-20T08:55:00Z
started: null
completed: null
current_stage: null
stages_completed: []
requires_bolts:
  - 029-fiscal-year-reads
  - 030-fiscal-year-reads
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 5
---

# Bolt: 031-fiscal-year-reads

## Overview

Pin the derived fiscal-year rule down with tests, and prove the compatibility claim.

## Objective

Discharge the fiscal-year testing concern already recorded at `docs/testing.md:118` — Bangkok Sep
30/Oct 1 boundaries, leap years, host-timezone independence, and query scoping across
enroll/Cover/answer/score/factory — and establish the parity evidence for "omitting `fiscalYear`
changes nothing".

## Stories Included

- **006-fiscal-year-boundary-coverage**: Boundary, timezone, scoping, and parity coverage (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model** → `ddd-01-domain-model.md`
- [ ] **2. Technical Design** → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis** → likely skipped; decisions recorded by bolts 029 and 030
- [ ] **4. Implement**
- [ ] **5. Test** → `ddd-03-test-report.md`

## Dependencies

### Requires

- **029-fiscal-year-reads** (Required): the resolver under test
- **030-fiscal-year-reads** (Required): the read paths under test

### Enables

- None directly, but unit `002-out-of-year-writes` builds on the same resolver and inherits this
  confidence.

## Expected Outputs

- Boundary tests at 2026-09-30 23:59:59.999 and 2026-10-01 00:00:00.000 Bangkok.
- Leap-year window arithmetic coverage.
- The suite passing identically under `TZ=UTC` and `TZ=Asia/Bangkok`.
- Per-role scoping assertions on addressed reads: Factory, Provincial, Evaluator, DOED.
- `meta.total`-versus-page agreement across `fiscalYear` combined with each existing filter.
- Parity assertions proving unchanged responses when `fiscalYear` is omitted, on every touched endpoint.
- A recorded observation of PostgreSQL-side boundary behaviour for rows written by
  `CURRENT_TIMESTAMP`.

## Success Criteria

- [ ] The story satisfies every acceptance criterion.
- [ ] Boundary behaviour is asserted, not inferred.
- [ ] Parity coverage exists for every endpoint bolt 030 touched.
- [ ] No assertion depends on the test host's timezone.
- [ ] Nondeterminism from absent BR-07 enforcement is documented as such, never asserted as determinism.
- [ ] `docs/testing.md` and `docs/business-rules.md` updated where this bolt changes what is known.
- [ ] Focused tests pass; integration tests pass or are reported as skipped with the reason.
- [ ] Code and artifacts reviewed.

## Notes

This bolt is where the intent's central compromise gets documented honestly. Because no
fiscal-year column is persisted, `docs/business-rules.md` BR-06 does not become **Verified** —
the application-side rule is now explicit and tested, but the PostgreSQL-side `timestamp without
time zone` comparison remains what it was. Record what is actually true rather than upgrading the
confidence rating because the code looks tidier.

The same applies to BR-07. This intent adds no unique constraint, so duplicate enrollments within a
year remain possible and `.limit(1)` remains arbitrary in that case. Tests should demonstrate that
limitation exists rather than paper over it.
