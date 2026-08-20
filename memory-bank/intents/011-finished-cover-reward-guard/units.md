---
intent: 011-finished-cover-reward-guard
phase: inception
status: units-decomposed
updated: 2026-07-20T04:05:27Z
---

# Finished-Cover Reward Guard - Unit Decomposition

## Project Type

`backend-api`, using the catalog's domain-driven backend decomposition and
`ddd-construction-bolt`. No frontend unit is created because endpoint and response contracts remain
unchanged.

## Units Overview

This intent contains one cohesive backend unit.

### Unit 1: `001-finished-cover-reward-guard`

**Description**: Enforce and regression-test latest-CoverLog finished-only Grade eligibility across
Score Reports, finalize responses, and finalize email payloads.

**Assigned Requirements**: FR-1, FR-2, FR-3, FR-4, FR-5

**Deliverables**:

- Audited Grade-producing paths and the smallest necessary service correction, if any.
- Focused service/integration tests for status gating and surface parity.
- No endpoint, schema, database, scoring-formula, or workflow change.

**Dependencies**:

- Existing score-report capability from intent `001-score-calculator-and-report`.
- Existing shared finalize capability from intent `008-per-answer-verdict-save`.
- Both dependencies are already implemented; no active construction bolt is blocked.

**Estimated Complexity**: Small

## Requirement-to-Unit Mapping

- **FR-1** Latest CoverLog is the Grade eligibility authority → `001-finished-cover-reward-guard`
- **FR-2** Score reports return Grade only for finished Covers → `001-finished-cover-reward-guard`
- **FR-3** Finalize returns/emails Grade only after a finished transition → `001-finished-cover-reward-guard`
- **FR-4** Existing API and scoring contracts remain unchanged → `001-finished-cover-reward-guard`
- **FR-5** Finished-only Grade regression coverage → `001-finished-cover-reward-guard`

## Unit Dependency Graph

```text
001-score-calculator-and-report (complete) ─┐
                                            ├─> 001-finished-cover-reward-guard
008-per-answer-verdict-save (complete) ─────┘
```

## Execution Order

1. Execute the single `001-finished-cover-reward-guard` unit.

## Why One Unit

All requirements express one invariant over the existing Cover/Score domain: Grade eligibility is
derived from the latest CoverLog. Splitting reads, finalize, and tests into independently deployed
units would divide one rule across artificial boundaries and weaken consistency.

