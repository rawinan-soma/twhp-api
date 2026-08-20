---
id: 003-finished-grade-contract-regression
unit: 001-finished-cover-reward-guard
intent: 011-finished-cover-reward-guard
status: ready
priority: must
created: 2026-07-20T04:05:27Z
assigned_bolt: 024-finished-cover-reward-guard
implemented: false
---

# Story: 003-finished-grade-contract-regression

## User Story

**As a** TWHP maintainer
**I want** focused regression proof across every Grade-returning surface
**So that** the finished-only reward rule stays consistent without changing existing API behavior

## Acceptance Criteria

- [ ] **Given** the Factory single-report and all three staff list-report paths, **When** their status
  matrices are tested, **Then** only finished reports contain a non-null Grade.
- [ ] **Given** Evaluator and Admin finalize surfaces, **When** finished and revision outcomes are
  tested, **Then** response and email Grade behavior is identical.
- [ ] **Given** the existing TypeBox response contracts, **When** non-finished and finished fixtures
  are validated, **Then** nullable Grade remains accepted without changing any endpoint schema.
- [ ] **Given** the completed change, **When** focused validation runs, **Then** score formulas,
  endpoint paths, authorization, status codes, and non-Grade fields remain unchanged.
- [ ] **Given** no safe disposable database is confirmed, **When** handing off validation, **Then** DB
  integration tests are explicitly reported as skipped rather than run against an unknown database.

## Technical Notes

- Build on stories 001 and 002; favor assertions at existing service seams.
- Current implementation may already satisfy the production rule. In that case, the valid outcome is
  regression coverage plus an evidence-backed no-production-change report.
- Keep authentication test files in separate invocations where relevant; do not run bare `bun test`.

## Dependencies

### Requires

- 001-score-report-finished-grade-guard
- 002-finalize-finished-grade-publication

### Enables

- None

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Response has numerical scoring while Cover is in-review | Valid, but Grade must be null |
| API consumer caches an older finished report | Client caching is outside backend scope; current API response must still follow latest log |
| Existing code already passes all new assertions | Do not alter runtime code merely to create a diff |

## Out of Scope

- Frontend rendering or cache invalidation.
- Historical data correction.
