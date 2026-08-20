---
id: 024-finished-cover-reward-guard
unit: 001-finished-cover-reward-guard
intent: 011-finished-cover-reward-guard
type: ddd-construction-bolt
status: in-progress
stories:
  - 001-score-report-finished-grade-guard
  - 002-finalize-finished-grade-publication
  - 003-finished-grade-contract-regression
created: 2026-07-20T04:05:27Z
started: 2026-07-20T04:14:58Z
completed: null
current_stage: test
stages_completed:
  - name: domain-model
    completed: 2026-07-20T04:19:04Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-07-20T04:22:28Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-07-20T04:23:32Z
    artifact: no-new-adr-required
  - name: implement
    completed: 2026-07-20T04:32:49Z
    artifact: regression-tests-no-runtime-change
requires_bolts: []
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 024-finished-cover-reward-guard

## Overview

Audit and harden finished-only Grade eligibility across Score Reports, finalize responses, and
finalize email payloads, while preserving every endpoint and non-Grade behavior.

## Objective

Establish regression tests proving that only the greatest-ID `CoverLog.status = finished` permits a
Grade. Apply the smallest production correction only if a test exposes a violating path; otherwise
finish with test coverage and an evidence-backed no-runtime-change result.

## Stories Included

- **001-score-report-finished-grade-guard**: Gate Score Report Grade by latest finished CoverLog (Must)
- **002-finalize-finished-grade-publication**: Publish Grade only after finished finalize transition (Must)
- **003-finished-grade-contract-regression**: Prove surface parity and preserve contracts (Must)

## Bolt Type

**Type**: DDD Construction Bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. Domain Model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. Technical Design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. ADR Analysis**: Pending/optional → only if construction uncovers a policy decision
- [ ] **4. Implement**: Pending → focused tests and smallest necessary service correction
- [ ] **5. Test**: Pending → `ddd-03-test-report.md`

## Dependencies

### Requires

- No active bolt dependency. Intents `001-score-calculator-and-report` and
  `008-per-answer-verdict-save` supply already-implemented capabilities.

### Enables

- None; terminal contract-hardening bolt.

## Expected Outputs

- Status-matrix and latest-log-wins regression coverage for Score Reports.
- Finished/revision Grade publication coverage for shared finalize behavior.
- Route-schema compatibility assertions.
- Production-code change only if the new tests demonstrate one is required.
- Validation report separating safe focused tests from DB-dependent checks.

## Success Criteria

- [ ] All three stories satisfy every acceptance criterion.
- [ ] No non-finished response or result-email payload contains a non-null Grade.
- [ ] Finished Score Reports/finalize results retain the existing Grade calculation.
- [ ] No endpoint, schema, status code, score formula, authorization, or workflow regression.
- [ ] Focused tests pass; DB integration tests run only with explicit disposable-DB confirmation.
- [ ] Code and artifacts reviewed.

## Notes

The initial source investigation found existing conditional Grade gates. The bolt must treat a
test-only hardening outcome as legitimate and must not manufacture unrelated implementation work.
