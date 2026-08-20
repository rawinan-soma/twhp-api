---
unit: 001-finished-cover-reward-guard
intent: 011-finished-cover-reward-guard
phase: inception
status: ready
created: 2026-07-20T04:05:27Z
updated: 2026-07-20T04:12:29Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: Finished-Cover Reward Guard

## Purpose

Make the Grade reward contract explicit and regression-safe: only a Cover whose latest CoverLog is
`finished` may produce a non-null Grade. Preserve all existing score, endpoint, workflow,
authorization, response-shape, and email behavior outside that eligibility rule.

## Scope

### In Scope

- Latest-CoverLog status resolution used by score-report paths.
- Grade eligibility for Factory single reports and Evaluator/Provincial/Admin list reports.
- Grade eligibility for shared evaluator/Admin finalize responses and email job payloads.
- Focused tests for latest-log ordering, all Cover statuses, and cross-surface consistency.
- The smallest production-code correction necessary if the audit finds any Grade-producing path
  that violates the rule.

### Out of Scope

- Preventing incomplete Covers from becoming `finished`.
- Changing Factory submission, evaluator review, or Cover transition rules.
- Changing numerical score availability during `in_review`.
- Changing Grade formulas, thresholds, special-question rules, or live-choice behavior.
- Adding endpoints, changing response schemas, persisting Grade, or changing the database schema.
- Repairing historical Covers or rewards.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Latest `CoverLog` is the Grade eligibility authority | Must |
| FR-2 | Score reports return Grade only for finished Covers | Must |
| FR-3 | Finalize returns/emails Grade only after a finished transition commits | Must |
| FR-4 | Existing API and scoring contracts remain unchanged | Must |
| FR-5 | Finished-only Grade regression coverage | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Relevant attributes |
|--------|-------------|---------------------|
| Cover | Assessment and scoring boundary | `id`, `enrollId` |
| CoverLog | Append-only Cover state event; greatest ID is current | `id`, `coverId`, `status` |
| Answer | Current scoring input | `coverId`, `selectedChoice` |
| Question | Category and Grade-gate metadata | `category`, `special` |
| Grade | On-demand reward value object | `gold`, `silver`, `certificate`, `joined` |
| Score Report | Role-scoped read model | `coverStatus`, nullable `grade`, `scoring` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| Resolve current Cover status | Select greatest CoverLog ID per Cover | Cover ID/log rows | `in_progress`, `in_review`, or `finished` |
| Build Score Report | Calculate numerical breakdown and conditionally Grade | Cover, status, Answers/Questions | Score Report with nullable Grade |
| Finalize Cover | Commit transition and conditionally publish Grade | Cover ID, reviewer, answer states | Finished+Grade or revision+null Grade |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 3 |
| Must Have | 3 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 001-score-report-finished-grade-guard | Gate Score Report Grade by latest finished CoverLog | Must | Ready |
| 002-finalize-finished-grade-publication | Publish Grade only after finished finalize transition | Must | Ready |
| 003-finished-grade-contract-regression | Prove surface parity and preserve existing contracts | Must | Ready |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| `001-score-service` (intent `001`) | Owns Score Report calculation/read paths |
| `001-per-answer-verdict-save` (intent `008`) | Owns shared evaluator/Admin finalize operation |

Both dependencies are already implemented.

### Depended By

| Unit | Reason |
|------|--------|
| None | Terminal contract-hardening unit |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| PostgreSQL | CoverLog ordering and score inputs | Medium: integration validation requires an explicitly disposable test DB |
| BullMQ/Redis | Finalize email job payload | Low: tests must stub the queue and must not enqueue real jobs |

## Technical Context

### Suggested Technology

Use the existing Bun, TypeScript, ElysiaJS, Drizzle/PostgreSQL, TypeBox, and Bun test stack. Add no
dependency.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| Factory score route | Existing API | REST |
| Evaluator/Provincial/Admin score routes | Existing APIs | REST |
| Evaluator/Admin finalize routes | Existing shared service | REST/service call |
| CoverLogs/Answers/Questions | Existing database | Drizzle/PostgreSQL |
| Result email queue | Existing outbound job | BullMQ/Redis |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Cover state history | Existing PostgreSQL append-only logs | Unchanged | Unchanged |
| Grade | Derived value only | Not persisted | Request/job lifetime |

## Constraints

- Greatest `CoverLogs.id` wins; do not use timestamps.
- `grade` remains nullable and on demand.
- Numerical score availability and formula remain unchanged.
- No schema, endpoint, authorization, or transition change.
- Integration tests may run only against an explicitly confirmed disposable, migrated, seeded DB.
- Queue behavior must be stubbed; no real worker/email execution.

## Success Criteria

### Functional

- [ ] Every non-finished Score Report has `grade: null`.
- [ ] Every finished Score Report has the existing computed Grade.
- [ ] Finalize publishes Grade only after committing a finished CoverLog transition.
- [ ] Revision and failure outcomes never expose or enqueue Grade.
- [ ] Latest-log ordering controls all eligibility decisions.

### Non-Functional

- [ ] All Grade-producing surfaces apply one consistent rule.
- [ ] No endpoint or non-Grade contract changes.
- [ ] No new persistence or external side effect.

### Quality

- [ ] All acceptance criteria met.
- [ ] Focused isolated tests pass.
- [ ] Integration tests pass when the safe database precondition is satisfied, or are reported as
  skipped with that reason.
- [ ] Non-mutating Biome diagnostics are reported as baseline versus introduced findings.

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| 024-finished-cover-reward-guard | DDD | 001, 002, 003 | Audit/correct Grade gates and add cross-surface regression coverage |

## Notes

Current source appears to implement the main conditional gates already. Construction must begin with
an audit and failing regression tests; it must not manufacture a production-code change if tests
prove the contract is already satisfied.
