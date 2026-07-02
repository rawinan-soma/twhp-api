---
intent: 005-network-and-audit-logging
created: 2026-06-22T00:00:00Z
status: in-progress
---

# Inception Log: 005-network-and-audit-logging

## Overview

**Intent**: Add two persisted logging facilities — a high-volume **network/access log**
(`network_logs`) and a low-volume, append-only **accountability/audit log** (`audit_logs`) —
plus a 180-day retention purge for the network log. Write-only (no read API this intent).
**Type**: Infrastructure
**Created**: 2026-06-22

## Artifacts Created

| Artifact       | Status | File                                              |
| -------------- | ------ | ------------------------------------------------- |
| Requirements   | ✅     | requirements.md                                   |
| System Context | ✅     | system-context.md                                 |
| Units          | ✅     | units.md + units/00{1,2,3}-*/unit-brief.md        |
| Stories        | ✅     | units/*/stories/*.md (6)                           |
| Bolt Plan      | ✅     | memory-bank/bolts/013..016-*                       |

## Summary

| Metric                      | Count |
| --------------------------- | ----- |
| Functional Requirements     | 9     |
| Non-Functional Requirements | 3 areas (Performance/Reliability, Integrity/Growth, Security) |
| Units                       | 3     |
| Stories                     | 6     |
| Bolts Planned               | 4     |

## Units Breakdown

| Unit | Stories | Bolts | Priority |
| ---- | ------- | ----- | -------- |
| 001-network-logging | 2 | 1 (013) | Must |
| 002-accountability-logging | 3 | 2 (014, 015) | Must |
| 003-log-retention | 1 | 1 (016) | Must |

## Decision Log

| Date | Decision | Rationale | Approved |
| ---- | -------- | --------- | -------- |
| 2026-06-22 | New intent `005`, type Infrastructure | Cross-cutting logging facility, distinct from existing feature intents | Yes (PO) |
| 2026-06-22 | **Network log = `network_logs` DB table** (not stdout-only) | PO chose DB persistence + retention over enrich-stdout, after the memory-growth tradeoff was explained (stdout=flat RAM; DB=disk growth, bounded by retention) | Yes (PO, Checkpoint 1) |
| 2026-06-22 | **Audit scope = ALL state-changing actions + auth events** ("1 + 3") | Broadest accountability coverage requested | Yes (PO, Checkpoint 1) |
| 2026-06-22 | **Two separate tables** (`network_logs`, `audit_logs`) | They answer different questions, differ in volume/shape/value | Yes (PO, Checkpoint 1) |
| 2026-06-22 | **Write-only this intent** — no read/query API | Capture + retention first; read endpoints deferred to a future intent | Yes (PO, Checkpoint 1) |
| 2026-06-22 | **Retention = 180 days for BOTH logs** (shared window), configurable | PO-specified; network bloat + PO chose same window for audit (revisit if compliance needs longer) | Yes (PO, Checkpoint 2) |
| 2026-06-22 | **Keep `coverLogs` + `answerLogs`** — `audit_logs` is additive | PO directive: domain status-history tables must continue to exist | Yes (PO, Checkpoint 2) |
| 2026-06-22 | Network capture reuses existing `elysia-logger` lifecycle; writes fire-and-forget | No parallel framework; logging must never add latency or fail requests | Proposed (Construction seam) |
| 2026-06-22 | Audit capture via explicit service-layer helper (not HTTP inference) | Accurate entity ids + before/after only available in services | Proposed (Construction seam) |
| 2026-06-22 | `audit_logs` is additive; does **not** replace `coverLogs`/`answerLogs` | Audit is cross-cutting (auth, enroll, score) beyond domain status-history | Proposed (Open Question) |

## Scope Changes

| Date | Change | Reason | Impact |
| ---- | ------ | ------ | ------ |

## Ready for Construction

**Checklist**:

- [x] Requirements documented
- [x] Requirements approved (Checkpoint 2, 2026-06-22)
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [ ] Human review complete (Checkpoint 3 + 4)

## Open Questions

1. ✅ RESOLVED — **Audit retention = 180 days** (shared window with network log).
2. ✅ RESOLVED — **Keep `coverLogs`/`answerLogs`**; `audit_logs` is additive.
3. ⏳ **Action taxonomy** — typed string constants + plain `text` column (recommended) vs. pgEnum. Decide at Checkpoint 3.

## Next Steps

1. PO reviews artifacts at **Checkpoint 3** (Context + Units + Stories + Bolts) and confirms
   **Checkpoint 4** (ready for Construction).
2. Construct in dependency order: **013-network-logging** and **014-accountability-logging**
   (independent, can run in parallel) → **015-accountability-logging** (needs 014) →
   **016-log-retention** (needs 013 + 014, both tables).
3. Execute, e.g.: `/specsmd-construction-agent --unit="001-network-logging"`

## Dependencies

- **Within-intent**: 015 requires 014; 016 requires 013 + 014.
- **Cross-intent (soft)**: 2FA audit events (story `003-auth-event-audit`) extend to intent
  002's flow when present — not a hard blocker (login/logout/refresh audited regardless).
