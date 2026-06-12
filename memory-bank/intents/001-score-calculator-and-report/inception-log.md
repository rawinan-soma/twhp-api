---
intent: 001-score-calculator-and-report
created: 2026-06-03T00:00:00Z
completed: 2026-06-03T00:00:00Z
status: complete
---

# Inception Log: score-calculator-and-report

## Overview

**Intent**: Calculate and expose assessment scores (overall + per category) for all four roles, scoped by access control
**Type**: New Feature (green-field addition to existing assessment domain)
**Created**: 2026-06-03

## Artifacts Created

| Artifact | Status | File |
|----------|--------|------|
| Requirements | ✅ | requirements.md |
| System Context | ✅ | system-context.md |
| Units | ✅ | units/001-score-service/unit-brief.md |
| Stories | ✅ | units/001-score-service/stories/ (8 files) |
| Bolt Plan | ✅ | memory-bank/bolts/001-score-service/, 002-score-service/ |

## Summary

| Metric | Count |
|--------|-------|
| Functional Requirements | 8 |
| Non-Functional Requirements | 2 |
| Units | 1 |
| Stories | 8 |
| Bolts Planned | 2 |

## Decision Log

| Date | Decision | Rationale | Approved |
|------|----------|-----------|---------|
| 2026-06-03 | Score calculated on-demand, not persisted | Answers can change during review; no migration needed; see ADR 0001 | Yes |
| 2026-06-03 | Score only available when cover is in_review or finished | in_progress scores are meaningless (partial answers) | Yes |
| 2026-06-03 | special field has no effect on scoring | special controls file validation only | Yes |
| 2026-06-03 | n/a answers excluded from numerator and denominator | Factory should not be penalised for inapplicable questions | Yes |
| 2026-06-03 | All 4 roles get separate endpoints with access-scoped data | Mirrors existing enroll/cover access control pattern | Yes |
| 2026-06-03 | List responses include full per-category breakdown | Avoids extra round-trip for frontend table rendering | Yes |

## Scope Changes

| Date | Change | Reason | Impact |
|------|--------|--------|--------|
| 2026-06-12 | FR-9: nest scores under `scoring` with `scoredCount`/`maxScore`/`achievedScore`/`percentage` per group; remove flat fields | Consumers need the scoring basis (non-n/a count + max) and raw achieved, not just the percentage | Breaking response change on all 4 endpoints; new story 009 + bolt 005; score tests + frontend must migrate |

## Ready for Construction

**Checklist**:

- [x] All requirements documented
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [x] Human review complete

## Next Steps

1. Gather requirements (Checkpoint 1 → 2)
2. Define system context
3. Decompose into units
4. Create stories
5. Plan bolts

## Dependencies

No blocking dependencies — score feature is purely additive (read-only, no schema changes).
