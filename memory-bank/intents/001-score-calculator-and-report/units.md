---
intent: 001-score-calculator-and-report
phase: inception
created: 2026-06-03T00:00:00Z
---

# Units: Score Calculator and Report

## Project Type: backend-api
Decomposition: domain-driven. No frontend unit.

## Units

| Unit | Purpose | FRs | Priority | Bolt Type |
|------|---------|-----|----------|-----------|
| `001-score-service` | Score calculation engine + all 4 role-scoped endpoints | FR-1 to FR-8 | Must | ddd-construction-bolt |

## Requirement-to-Unit Mapping

- **FR-1** Score Calculation Formula → `001-score-service`
- **FR-2** Per-Category Score Breakdown → `001-score-service`
- **FR-3** Cover Status Guard → `001-score-service`
- **FR-4** Factory Score Endpoint → `001-score-service`
- **FR-5** Evaluator Score List Endpoint → `001-score-service`
- **FR-6** Provincial Officer Score List Endpoint → `001-score-service`
- **FR-7** Admin Score List Endpoint → `001-score-service`
- **FR-8** Score Report Shape → `001-score-service`

## Dependency Graph

    001-score-service (no cross-unit dependencies)

Depends on existing completed units: authentication, enroll, cover (read-only consumption only).
