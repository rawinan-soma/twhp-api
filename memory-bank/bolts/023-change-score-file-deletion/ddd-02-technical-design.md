---
unit: 001-change-score-file-deletion
bolt: 023-change-score-file-deletion
stage: design
status: complete
updated: 2026-07-07T00:00:00Z
---

# Technical Design - Widen Finalize File Deletion to `change_score`

## Architecture Pattern

**Existing layered monolith, unchanged.** No new module, no schema change, no new route. The entire change is a predicate edit inside the existing `finalize` method of `evaluatorReviewService` (`src/service/evaluator-review.ts`), plus a rename of the variable/comments that named the old, narrower predicate. Services continue to **return** `status(code, body)`; never throw (coding-standards). File I/O stays outside the DB transaction (project pattern) — this bolt does not touch that ordering, only which Answers feed into it.

## Layer Structure

```text
┌─────────────────────────────┐
│      Presentation           │  POST …/covers/:coverId/finalize — UNCHANGED (evaluators + admins)
├─────────────────────────────┤
│      Application/Domain     │  evaluator-review.ts: finalize() — predicate widened
├─────────────────────────────┤
│     Infrastructure          │  Drizzle (same read/txn shape) · MinIO deleteFileStrict (wider input set)
└─────────────────────────────┘
```

## Component Design (bolt scope — stories 001, 002)

### `finalize` (service method) — targeted edit, `src/service/evaluator-review.ts:417-441`

**Current code** (pre-bolt):
```ts
// Hard-reject set: rejected + verdictChoice null → files deleted + nulled.
// (change_score/overridden files carry a verdictChoice and are preserved.)
const hardRejectIds = new Set(
  resolved
    .filter((r) => r.status === "rejected" && r.verdictChoice === null)
    .map((r) => r.answerId),
);
```

**New code** (this bolt):
```ts
// Rejected-at-finalize set: any Answer whose final status is "rejected", whether via a
// hard reject or a change_score — both delete evidence per ADR-0006. An Answer re-saved
// to approve/recommended before finalize is excluded, since `resolved` reflects only the
// latest persisted answerLogs row per Answer (unchanged read).
const rejectedAnswerIds = new Set(
  resolved.filter((r) => r.status === "rejected").map((r) => r.answerId),
);
```

Every downstream reference to `hardRejectIds` in the same function (the `fileUrlsToDelete` accumulation loop and the `hardRejectIds.size > 0` DB-null-out branch) is renamed to `rejectedAnswerIds` — no logic change beyond the filter itself, since both consume the `Set<answerId>` identically regardless of what produced membership.

**No changes** to:
- `resolved` computation (still `{ answerId, status, verdictChoice }` per latest log, unchanged query).
- `hasRejected` / `newCoverStatus` resolution — already `resolved.some(r => r.status === "rejected")`, which already counted change_score. Unaffected by this bolt.
- Promotion logic (`recommended → finished`), grade computation, email selection, transaction shape.
- `saveAnswerVerdict` — remains zero-MinIO-I/O.

## API Design

No API contract change. `POST …/covers/:coverId/finalize` keeps its existing request (`FinalizeSchema`, empty body) and response shapes (`200 {message, coverStatus, grade}`, `400/403/404/500 {message}`) on both `evaluators/covers/*` and `admins/covers/*`. No OpenAPI regen required — response shape and status codes are unchanged; only the *set* of Answers affected by an existing side effect changes.

## Data Persistence

| Table | Access | Notes |
|-------|--------|-------|
| `answerLogs` | **read** latest per `answerId` (unchanged query) | Same `selectDistinctOn` shape; `status`/`verdictChoice` now both consumed by the single widened filter |
| `answers` | **write** — `fileUrl1_1..fileUrl3_3` nulled (inside txn) | Same column set, wider row set: now includes change_score Answers, not just hard-reject |
| `coverLogs` | **write** exactly one row (inside txn) | Unchanged — `newCoverStatus` computation untouched |

## Security Design

| Concern | Approach |
|---------|----------|
| Authorization (role/cover) | Unchanged — ODPC-only gate, region-scoped access check, both untouched by this bolt |
| Evidence safety | **Changed per ADR-0006**: a `change_score` Answer's file is no longer retained past finalize. Factory must re-upload to redo (activates existing `src/service/answer.ts` file-requirement validator — no code change needed there) |
| Re-finalize / double-commit | Unaffected — ADR-3's two-finalizer window still relies on `finished` immutability + the `in_review` hard-gate, neither of which this bolt touches |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| Atomicity | Unchanged — file deletes still precede the single `db.transaction`; a MinIO failure still aborts with `500` before any DB write |
| Correctness parity | The widened predicate must delete strictly a **superset** of what the old predicate deleted (every old hard-reject case still matches `status === "rejected"`) — Stage 5 asserts this as a regression, not just the new behavior |
| Auditability | Unchanged — `eval_id`/`evaluatorId` traceability untouched |

## Error Handling

No new error paths. The existing `500` on `deleteFileStrict` failure now covers a larger candidate set of files, but the response shape and pre-transaction-abort ordering are identical.

## External Dependencies

| Service | Purpose | Integration |
|---------|---------|--------------|
| MinIO | Delete evidence files for rejected-at-finalize Answers | Same `utilities().deleteFileStrict(url)` call, wider input array |

_No new external dependency introduced._

## Testing Approach (executed in Stage 5)

Derived from story 001/002 ACs only:
- A `change_score` Answer's files are deleted + `fileUrl*` nulled at finalize (new case).
- A hard-reject Answer's files are still deleted (regression — must not have broken by the rename).
- A `recommended`/`finished` Answer's files are untouched (regression).
- An Answer `change_score`'d then re-saved to `approve` before finalize keeps its files (regression on the latest-log-wins read — proves no special-casing was needed or accidentally added).
- `coverStatus`/grade/email selection identical to pre-bolt behavior for all existing scenarios (regression — `hasRejected` already counted change_score, so this should require zero new logic to pass).
- Evaluator-surface and admin-surface (`adminReviewerContext`) finalize produce identical file-deletion + coverStatus outcomes for the same Cover state (surface-parity check).
- MinIO delete failure still aborts pre-transaction with `500` (regression).
