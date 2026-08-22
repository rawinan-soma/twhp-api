---
id: 033-out-of-year-writes
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
type: ddd-construction-bolt
status: planned
stories:
  - 003-factory-grace-window-policy
  - 004-grace-window-cover-completion
created: 2026-08-20T08:55:00Z
started: null
completed: null
current_stage: null
stages_completed: []
requires_bolts:
  - 032-out-of-year-writes
enables_bolts:
  - 034-out-of-year-writes
requires_units:
  - 001-fiscal-year-reads
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 4
---

# Bolt: 033-out-of-year-writes

## Overview

Give Factories 31 days to finish what the boundary interrupted.

## Objective

Declare the grace window once, as a rule relative to a fiscal-year boundary rather than as two
hard-coded 2026 dates, and apply it to the Factory answer and submission paths so that an unfinished
prior-year Cover can still be completed — while prior-year enrollment stays immutable.

## Stories Included

- **003-factory-grace-window-policy**: Single declared window, resolved centrally (Must)
- **004-grace-window-cover-completion**: Answer save, update, and Cover submission (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model** → `ddd-01-domain-model.md`
- [ ] **2. Technical Design** → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis** → the write-time-evaluation-versus-scheduled-sweep decision is a candidate
- [ ] **4. Implement**
- [ ] **5. Test** → `ddd-03-test-report.md`

## Dependencies

### Requires

- **032-out-of-year-writes** (Required): the authority model the grace window extends

### Enables

- **034-out-of-year-writes**: disambiguation and audit build on grace existing

## Expected Outputs

- One declared grace policy covering 2026-10-01 → 2026-10-31 inclusive, expressed relative to the
  rollover boundary so it recurs without edit.
- A predicate answering "does Factory grace apply to this target year at this instant", consuming
  the unit-001 resolver.
- Grace-window answer save, answer update, and Cover submission (`in_progress → in_review`).
- Refusal of prior-year enrollment create and update, during and after the window.
- Refusal of writes to a Cover that already reached `finished`.
- Attribution recording that grace authorised a given write.

## Success Criteria

- [ ] Both stories satisfy every acceptance criterion.
- [ ] The window exists as one value; no competing literal appears in any service.
- [ ] Grace covers Cover completion only — prior-year enrollment writes are refused.
- [ ] A `finished` Cover is never reopened.
- [ ] Boundary behaviour correct at 2026-10-31 23:59:59.999 and 2026-11-01 00:00:00.000 Bangkok.
- [ ] Only the immediately preceding fiscal year is covered; FY2025 is not.
- [ ] File I/O remains outside database transactions on the grace submission path.
- [ ] Per-answer verdict and finished-Cover reward behaviour unchanged.
- [ ] No scheduled job, sweep, or persisted flag is introduced.
- [ ] No database schema change of any kind.
- [ ] Code and artifacts reviewed.

## Notes

The window must be expressed as "31 days after the rollover boundary", not as the literal dates
2026-10-01 and 2026-10-31. The 2026 dates are the first instance of a recurring rule; hard-coding
them would silently drop the grace window in FY2028 with no failing test to notice.

Duplicating the window is the failure mode most likely to escape review: a Factory admitted by the
answer-save path and refused by the submit path would experience the system as losing its work at
the last step. One value, one predicate, consulted everywhere.

Grace must be evaluated at write time. There is no persisted marker and no job — the only repeatable
job in the system remains the 08:30 daily mail (`src/workers.ts:9`), and this intent adds none. This
follows directly from the no-schema-change constraint and keeps expiry a permission change rather
than a state change.

The upload-then-transact ordering matters more here than usual. A submission failing partway through
near the end of the window could otherwise leave orphaned objects behind at exactly the moment the
Factory loses the ability to retry.
