---
unit: 001-per-answer-verdict-save
bolt: 020-per-answer-verdict-save
stage: design
status: complete
updated: 2026-07-02T08:23:00Z
---

# Technical Design - ODPC Finalize (whole-Cover resolution)

## Architecture Pattern

**Existing layered monolith, unchanged** — ElysiaJS route → singleton service (`createEvaluatorReviewService(db)`) → Drizzle. This bolt continues the bolt-019 refactor: the second half of the split `verdict()` becomes `finalize(coverId, reviewer)`. **No new module, no new architectural pattern, no schema change.** The single behavioural change vs. the old `verdict()` batch: the whole-Cover transition is derived **purely from persisted `answerLogs`** — the in-flight `batchDecisionMap`/`effectiveState` merge is **removed**. Services **return** `status(code, body)`; never throw (coding-standards). File I/O runs **outside** the DB transaction (project pattern).

## Layer Structure

```text
┌─────────────────────────────┐
│      Presentation           │  POST …/covers/:coverId/finalize — DEFERRED to bolt 021
├─────────────────────────────┤   (FinalizeSchema body already exists from bolt 019)
│      Application/Domain      │  evaluator-review.ts: finalize()
│                             │   + pure planners: transitionOutcome() / hardRejectFiles()
├─────────────────────────────┤
│     Infrastructure          │  Drizzle (latest-log read + txn: finished logs + one coverLog)
│                             │   MinIO deleteFile (pre-txn) · emailQueue · scoreHelpers
└─────────────────────────────┘
```

## Component Design (bolt scope — story 004)

### `finalize` (service method) — refactor of `evaluator-review.ts:249–431`

Signature (conceptual):
```
finalize(coverId: number, reviewer: ReviewerContext)
  → status(200, { coverStatus: "finished" | "in_progress", grade?: Grade })
  | status(400 | 403 | 404, { message })
```

**Execution outline** (mirrors the domain model's 10 ordered rules):

1. **ODPC-only gate** — `if (reviewer.level !== "ODPC") return status(403, …)`. No DB read before the gate. (Native ODPC and DOED-admin-as-national both resolve to `level: "ODPC"`; admin carries `region: null`.)
2. **Cover access** — `helper.assertCoverAccess(coverId, reviewer.region)` → `404` if not accessible. *(Reuses the same helper as `saveAnswerVerdict`.)*
3. **Read snapshot** — one query for the latest log per Answer in the Cover, joined to `answers` for the file + live data:
   ```
   selectDistinctOn([answerLogs.answerId], {
     answerId:      answerLogs.answerId,
     status:        answerLogs.status,
     verdictChoice: answerLogs.verdictChoice,
     fileUrl:       answers.fileUrl,
   })
     .from(answerLogs)
     .innerJoin(answers, eq(answers.id, answerLogs.answerId))
     .where(eq(answers.coverId, coverId))
     .orderBy(answerLogs.answerId, desc(answerLogs.id))   // latest row wins per answerId
   ```
   This `rows: FinalizeRow[]` snapshot is the **sole** input (replaces `effectiveState`).
4. **Hard-gate** — `if (rows.some(r => r.status === "in_review")) return status(400, { message: "unresolved in_review answers remain" })`. No verdict invented.
5. **Plan** (pure, from `rows`):
   - `promotions = rows.filter(r => r.status === "recommended").map(r => r.answerId)`
   - `outcome = transitionOutcome(rows)` → `"finished"` iff no `rejected`; else `"in_progress"`
   - `deleteSet = hardRejectFiles(rows)` → `rows` where `status === "rejected" && verdictChoice === null && fileUrl != null`
6. **File deletes (before txn)** — `await Promise.all(deleteSet.map(url => utilities().deleteFileStrict(url)))` wrapped in `try/catch`; on failure `return status(500, …)` **before** step 7 → no partial transition. Uses the **strict** (non-swallowing) delete added in `utils.ts` — the best-effort `deleteFile` is kept for its other callers. *(Delete-before-txn mirrors the answer-service upload-before-txn pattern.)*
7. **Transaction (atomic)** — `await db.transaction(async (tx) => { … })`:
   - `tx.insert(answerLogs).values(promotions.map(id => ({ answerId: id, status: "finished", verdictChoice: null, description: null, evalId: reviewer.accountId })))` — **only** when `promotions.length > 0`.
   - `tx.insert(coverLogs).values({ coverId, status: outcome, evaluatorId: reviewer.accountId })` — exactly one row.
8. **Grade** — `if (outcome === "finished") grade = computeGrade(await calculateBreakdown(coverId))` (on-demand; not persisted — ADR-0001).
9. **Email** — resolve `enrolls.email` for the Cover; enqueue **one** job on `emailQueue`: the "complete + Grade" template (finished) or the "revision needed" template (in_progress). Content/templates unchanged from bolt 010.
10. **Return** — `status(200, { coverStatus: outcome, ...(grade ? { grade } : {}) })`.

### Pure planners (co-located in the service; no I/O)
- `transitionOutcome(rows): "finished" | "in_progress"` — `rows.some(r => r.status === "rejected") ? "in_progress" : "finished"`.
- `hardRejectFiles(rows): string[]` — `rows.filter(r => r.status === "rejected" && r.verdictChoice == null && r.fileUrl).map(r => r.fileUrl)`.

**Note on `recommended → finished` under `in_progress`:** promotions are appended **regardless** of `outcome` — settled Answers lock to `finished` while the Cover returns to `in_progress` for the Factory to revise the rejected ones. This reproduces the old batch end-state (negotiation loop, ADR-0004).

## API Design

| Endpoint | Method | Request | Response | Bolt |
|----------|--------|---------|----------|------|
| `finalize` (service method) | — | `(coverId, reviewer)` | `{ coverStatus, grade? }` or `status(4xx,{message})` | **020** |
| `POST …/covers/:coverId/finalize` | POST | `FinalizeSchema` (empty `{}`) | `200 { coverStatus, grade? }` / `400/403/404 {message}` | 021 (wiring, both surfaces) |

_This bolt delivers the service method + pure planners; the HTTP route (+ its OpenAPI response DTO) is wired in bolt 021 for both `evaluators/covers/*` and `admins/covers/*`._

## Data Persistence

| Table | Access | Notes |
|-------|--------|-------|
| `AnswerLogs` | **read** latest per `answerId` (`selectDistinctOn … order by id desc`) | The finalize snapshot: `status`, `verdictChoice`. **No schema change.** |
| `AnswerLogs` | **write** one `finished` row per promotion (inside txn) | The **only** place `answerStatus = finished` is written (FR-5). `verdictChoice`/`description` null; `evalId = reviewer.accountId`. Skipped when `promotions` is empty. |
| `CoverLogs` | **write** exactly one row (inside txn) | `status = outcome` (`finished`/`in_progress`), `evaluatorId = reviewer.accountId`. The single Cover transition. |
| `Answers` | **read** `id`, `coverId`, `fileUrl` (joined) | For belongs-to-cover scoping + hard-reject delete set. Never mutated. |
| `Enrolls` | **read** `email` | Factory recipient for the single post-finalize email. |

## Security Design

| Concern | Approach |
|---------|----------|
| Authentication | Caller identity via `evalGuard`/admin guard + resolved `ReviewerContext` (bolt 021 wires; service trusts the passed context). |
| Authorization (role) | **ODPC-only** hard gate: `reviewer.level === "ODPC"` else `403`. Tier-1 (`Mental`/`DOH`) can never finalize. |
| Authorization (cover) | `assertCoverAccess(coverId, region)` — region-scoped for evaluators, existence-only for national ODPC/admin (`region: null`). |
| Finalize validity | Hard-gate: any `in_review` → `400`; finalize invents no verdict, preserving the "every terminal verdict was explicitly authored" invariant (`eval_id` traceable). |
| Data integrity | `finished` written **only** here; append-only logs; `selectedChoice` never touched; single atomic `coverLogs` transition. |
| Evidence safety | Hard-reject files deleted **only** at finalize, **only** for final hard-rejects (`verdictChoice` null) — a tier-1/ODPC reject stays overridable until commit, so nothing deletes prematurely. Score-change/overridden files retained. |
| Re-finalize / double-commit | Preserve the existing cover-state precondition from the batch `commit` (verify in Stage 4): an already-`finished` Cover must not append a duplicate transition/email. specsmd ADR-3's two-finalizer window stays benign via this guard + `finished` immutability. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| Atomicity | Promotions + the single `coverLogs` row commit in one `db.transaction`. |
| Fault isolation | File deletes precede the txn; a MinIO failure aborts before any DB write → no partial transition (bolt success criterion). |
| Correctness parity | Outcome/delete-set/promotions derived purely from persisted logs must reproduce the old batch end-state exactly (Stage 5 asserts this per AC). |
| Auditability | `evaluatorId` on the `coverLog`; `evalId` on each promotion log; append-only history reconstructs the finalize. |
| Performance | One indexed `selectDistinctOn` read + one bulk insert + one insert; deletes are O(hard-rejects). No N+1. |

## Error Handling

| Error | Code | Response | Order |
|-------|------|----------|-------|
| Caller not ODPC/admin | 403 | `{ message: "finalize is restricted to ODPC" }` | before any read |
| Cover not accessible / not found | 404 | `{ message: "cover not found" }` | after gate |
| Any Answer still `in_review` | 400 | `{ message: "unresolved in_review answers remain" }` | after read, before side effects |
| Cover already finalized (if existing guard) | 400 | preserve existing message | (verify in Stage 4) |
| MinIO delete failure (`deleteFileStrict`) | 500 | returned `status(500)`; **no** DB write occurred; logged by global `onAfterResponse` | before txn |
| Body validation | 400 | TypeBox `VALIDATION` → global handler | — |

## External Dependencies

| Service | Purpose | Integration |
|---------|---------|-------------|
| PostgreSQL (Drizzle) | Latest-log read; txn (finished logs + one coverLog) | SQL; single `db.transaction` |
| MinIO | Delete hard-reject evidence files | `utilities().deleteFileStrict(url)` (new, non-swallowing) — **before** the txn; failure → `500`, no txn |
| BullMQ (`emailQueue`) | One Factory email per finalize | enqueue after commit; content unchanged from bolt 010 |
| scoreHelpers | On-demand Grade | `calculateBreakdown(coverId)` → `computeGrade(...)`; finished outcome only; not persisted (ADR-0001) |

_All four were **out of scope** in bolt 019 (write-only) and become active here — this is the side-effecting half of the split._

## Testing Approach (executed in Stage 5)

Integration tests against the service (project pattern; no unit framework yet), derived from story 004 ACs only:
- Tier-1 finalize → `403`; ODPC/admin allowed.
- Leftover `in_review` → `400` hard-gate; no logs/coverLog/files/email written.
- `recommended → finished` promotion for tier-1 approvals, Factory-accepts, and ODPC's own approvals; verify **one** `finished` log per promotion, `evalId = finalizer`.
- Outcome: all-finished → one `coverLog` `finished` + Grade in response; ≥1 rejected → one `coverLog` `in_progress`, no Grade (promotions still applied).
- Deferred deletion: hard-reject (`verdictChoice` null) files deleted, **only** at finalize, **only** for final hard-rejects; score-change/overridden files retained.
- Exactly one email per finalize, correct template per outcome.
- MinIO delete failure → no partial transition (no `coverLog`, no promotion logs).
- Invariant sweep: no save path writes `answerStatus = finished` (FR-5).
