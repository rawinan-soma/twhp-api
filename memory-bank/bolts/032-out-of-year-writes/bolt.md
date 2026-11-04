---
id: 032-out-of-year-writes
unit: 002-out-of-year-writes
intent: 013-fiscal-year-addressing
type: ddd-construction-bolt
status: planned
stories:
  - 001-evaluator-level-guard
  - 002-past-year-write-authority
created: 2026-08-20T08:55:00Z
started: null
completed: null
current_stage: null
stages_completed: []
requires_bolts:
  - 029-fiscal-year-reads
enables_bolts:
  - 033-out-of-year-writes
requires_units:
  - 001-fiscal-year-reads
blocks: true
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 2
  testing_scope: 4
---

# Bolt: 032-out-of-year-writes

## Overview

Introduce the right to write a closed fiscal year, held by two authorities and expressed by a guard
the system cannot currently write.

## Objective

Build evaluator-level-scoped middleware distinguishing `ODPC` from `Mental` and `DOH`, then apply
past-fiscal-year write authority to the review, verdict, and finalize paths for `Role.DOED` and
ODPC-level Evaluators — region-scoped, non-expiring, and attributable.

## Stories Included

- **001-evaluator-level-guard**: Middleware reading `Evaluators.level` (Must)
- **002-past-year-write-authority**: Out-of-year write authorisation on write paths (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model** → `ddd-01-domain-model.md`
- [ ] **2. Technical Design** → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis** → the level-lookup-versus-token-widening decision is a strong candidate
- [ ] **4. Implement**
- [ ] **5. Test** → `ddd-03-test-report.md`

## Dependencies

### Requires

- **029-fiscal-year-reads** (Required): the resolver that decides whether a target year is current

### Enables

- **033-out-of-year-writes**: the grace window layers onto this authority model

## Expected Outputs

- A pre-composed, level-scoped guard alongside `adminGuard`, `factoryGuard`, `evalGuard`, and
  `officerGuard`, following the existing convention.
- Target-year determination taken from the record, never from request input.
- Past-year writes permitted for DOED and ODPC on the verdict and finalize paths.
- Distinct, logged refusals for every other role and evaluator level.
- Actor attribution on granted out-of-year writes.

## Success Criteria

- [ ] Both stories satisfy every acceptance criterion.
- [ ] `Mental` and `DOH` evaluators are refused past-year writes; `ODPC` is permitted.
- [ ] ODPC region scoping is unchanged — closed-year authority does not widen geographic reach.
- [ ] Current-year writes behave exactly as today for every role.
- [ ] No write path can nominate its own fiscal year.
- [ ] Refusals are distinguishable in logs from the existing wrong-region 404.
- [ ] Existing routes using `evalGuard` are behaviourally unchanged.
- [ ] No database schema change of any kind.
- [ ] Code and artifacts reviewed.

## Notes

This is the highest-uncertainty bolt in the intent, for two reasons.

The first is structural: the JWT payload carries `username` and `role`
(`src/service/authentication.ts:52-57`) but not evaluator level, so the guard needs either a
per-request lookup or a widened token. Widening the token reaches into session lifetime and refresh
rotation; a lookup does not. The conservative default is the lookup, but the decision should be made
explicitly and recorded rather than defaulted into.

The second is pre-existing: `docs/business-rules.md` records that some evaluator detail routes call
unscoped services, so `assertCoverAccess` may not sit on every path this bolt needs to guard. Verify
which paths actually centralise Cover authorisation before relying on that seam. Do not treat the
pre-existing gap as this intent's to fix — but do not build on it as though it were sound either.

Target-year-from-the-record is a security property, not a convenience. If a write could nominate its
own year, a caller could relabel which year it is editing and route around the authority check
entirely.
