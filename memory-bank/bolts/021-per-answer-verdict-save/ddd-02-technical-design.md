---
unit: 001-per-answer-verdict-save
bolt: 021-per-answer-verdict-save
stage: design
status: complete
updated: 2026-07-02T08:55:00Z
---

# Technical Design - Two-Phase Review over HTTP (routes + docs + tests)

## Architecture Pattern

**Existing ElysiaJS autoload monolith, unchanged.** Routes are file-based under `src/routes/**/index.ts`, auto-registered by `elysia-autoload`; each file exports `default (app: App) => app.group(...)` attaching a guard and endpoints, wiring `evaluatorReviewService` methods. This bolt **adds/removes route files** and **regenerates docs** — no new pattern, no service change (services are complete from bolts 019/020), no schema change. Routes stay **thin**: resolve a `ReviewerContext`, call one service method, return its `status(code, body)` directly.

## Layer Structure

```text
┌─────────────────────────────┐
│      Presentation           │  NEW: evaluators + admins save/finalize route files
│                             │  REMOVED: batch verdict route(s) + VerdictBatchSchema
├─────────────────────────────┤
│      Application/Domain      │  evaluatorReviewService (saveAnswerVerdict / finalize /
│                             │  getAnswers) — UNCHANGED (bolts 019/020)
├─────────────────────────────┤
│     Infrastructure          │  Drizzle/MinIO/BullMQ — UNCHANGED (reached via services)
└─────────────────────────────┘
             │
       docs/api/*  ← regenerated from the OpenAPI plugin after routes change
```

## Component Design (bolt scope)

### Story 005 — evaluator routes + batch removal
Autoloaded files under `src/routes/evaluators/covers/[coverId]/…`:

1. **Save** — `answers/[answerId]/verdict/index.ts`
   - Guard: `evalGuard`. Params: `t.Object({ coverId: t.Number(), answerId: t.Number() })`. Body: `VerdictSaveBodySchema`.
   - Handler: `reviewer = await resolveEvaluator(callerId)`; if it's an `ElysiaCustomStatusResponse` return it; else `return saveAnswerVerdict(coverId, answerId, reviewer, body)`.
2. **Finalize** — `finalize/index.ts`
   - Guard: `evalGuard`. Params: `t.Object({ coverId: t.Number() })`. Body: `FinalizeSchema` (`{}`).
   - Handler: resolve evaluator → `return finalize(coverId, reviewer)`. The ODPC-only gate lives in `finalize()` itself (tier-1 → `403`), so the route stays thin — no extra level check.
3. **Remove batch** — delete `covers/[coverId]/verdict/index.ts` (the old batch `POST …/verdict`). After removal that path 404s.

_Caller id source: the same `jwtPayload`-derived account id the existing evaluator routes use (mirror `getAnswers`'s route)._

### Story 006 — admin surface parity
Mirror the two route files under the admin cover surface, guarded by the admin guard, resolving via `adminReviewerContext(callerId)` (level `ODPC`, `region: null`):
- **Save** — `…/covers/[coverId]/answers/[answerId]/verdict/index.ts`
- **Finalize** — `…/covers/[coverId]/finalize/index.ts`
- Remove the old admin batch route(s).
- Both call the **same** `evaluatorReviewService` methods — no duplicated logic; outcomes identical to the evaluator-ODPC path aside from region scoping (existence-only).

> ⚠️ **Stage-4 binding**: the admin cover routes are mid-migration (recent "admin cover-review route rename"). Stage 4 must read the **actual** current admin route directory (e.g. `admins/covers/*` vs a renamed `admins/cover-review/*`) and place the mirrors + remove the old batch route consistently with that layout. The design (guard + `adminReviewerContext` + same service calls) is invariant to the exact folder name.

### Story 007 — answers-list + docs + tests
- **`getAnswers` untouched** — no edit to the `GET …/covers/:coverId/answers` route or service; add/keep a regression test asserting projection/scope/status unchanged.
- **Docs regen** — regenerate `docs/api/openapi.json`, `docs/api/API.md`, `docs/api/index.html` from the OpenAPI plugin after routes land (follow the existing regen command/script used for the recent `docs(api): regenerate OpenAPI` commit).
- **Test restructure** — align the two legacy integration files with the two-phase model (see Testing Approach).

## API Design

| Endpoint | Method | Request | Response | Story |
|----------|--------|---------|----------|-------|
| `…/evaluators/covers/:coverId/answers/:answerId/verdict` | POST | `VerdictSaveBodySchema` | `200 {message,answerId,status}` / `400/403/404 {message}` | 005 |
| `…/evaluators/covers/:coverId/finalize` | POST | `FinalizeSchema` `{}` | `200 {message,coverStatus,grade}` / `400/403/404 {message}` | 005 |
| `…/admins/covers/:coverId/answers/:answerId/verdict` | POST | `VerdictSaveBodySchema` | same as evaluator save | 006 |
| `…/admins/covers/:coverId/finalize` | POST | `FinalizeSchema` `{}` | same as evaluator finalize | 006 |
| `…/evaluators/covers/:coverId/verdict` (batch) | ~~POST~~ | — | **REMOVED** → 404 | 005 |
| `…/admins/covers/:coverId/verdict` (batch) | ~~POST~~ | — | **REMOVED** → 404 | 006 |
| `…/{surface}/covers/:coverId/answers` | GET | — | **UNCHANGED** | 007 |

Each route declares OpenAPI `detail` (tag/summary) + `response` map for `200/400/403/404`.

## Data Persistence

_None._ No schema change; routes perform no direct data access. `VerdictBatchSchema` and the `VerdictBatch` type (and the batch method `verdict()`) are **deleted** from `src/schema/evaluator-review.ts` / `src/service/evaluator-review.ts` once no route references them.

## Security Design

| Concern | Approach |
|---------|----------|
| AuthN | `evalGuard` (evaluator surface) / admin guard (admin surface) — pre-composed, unchanged. |
| Reviewer resolution | `resolveEvaluator` (region-scoped) vs `adminReviewerContext` (national, `region: null`). |
| Finalize authority | ODPC-only, enforced inside `finalize()` (`level !== "ODPC"` → `403`); routes add no bypass. |
| Cover/category scope | Enforced in the services (unchanged) via `assertCoverAccess` + `categoriesFor`. |
| Input validation | Numeric path params (`t.Number()`); typed bodies (`VerdictSaveBodySchema`/`FinalizeSchema`) → malformed → `400` via global handler. |

## NFR Implementation

| Requirement | Approach |
|-------------|----------|
| Consistency (two surfaces) | Both surfaces delegate to the one singleton service — parity by construction, asserted in tests. |
| Thinness / maintainability | No business logic in routes; deleting the batch route removes the last `finished`-writing non-finalize path (FR-5 becomes literally true project-wide). |
| Docs accuracy | `docs/api/*` regenerated from route definitions; drift is visible in the committed artifacts. |
| Backward-safety of read | `getAnswers` deliberately untouched; regression-tested. |

## Error Handling

| Case | Code |
|------|------|
| Malformed/non-numeric params or body | 400 (TypeBox `VALIDATION` → global handler) |
| Tier-1 hits finalize | 403 (from `finalize()`) |
| `recommended` edit by non-author non-ODPC (save) | 403 (from `saveAnswerVerdict()`) |
| Cover not accessible / answer not in cover | 404 / 400 (from services) |
| POST to removed batch path | 404 (route no longer exists) |

## Testing Approach (executed in Stage 5)

Restructure the two legacy integration files to the two-phase model, reusing the live-Postgres harness (per bolt 019/020):
- **`evaluator-review.integration.test.ts`** → per-Answer **save** cases: approve→recommended (tier-1 **and** ODPC); change_score; reject; no-op change_score `400`; category scope `403`; authorship guard (finished-immutable `400`, recommended author/ODPC-only, factory-accept protection `403`).
- **`evaluator-review.verdict.integration.test.ts`** → **finalize** cases: `in_review` hard-gate `400`; `recommended→finished` (incl. ODPC's own); transition finished/in_progress; deferred deletion only for final hard-rejects; one email per outcome; tier-1 finalize `403`.
- **Removed-batch assertions**: the "duplicate answerId in batch" case is gone; no test references `VerdictBatchSchema`; (optionally) a route-level check that the batch path 404s.
- **`getAnswers` regression**: projection/scope/status unchanged.
- **Full suite green** (the pre-existing unrelated `authentication/*` / `answer.integration.test.ts` type-noise is out of scope).

_Note: the bolt-020 `evaluator-review.finalize.integration.test.ts` already covers the finalize service directly; story 007's `.verdict.integration.test.ts` restructure is the route/legacy-file alignment. Stage 5 will decide whether to fold or keep both, avoiding duplicated coverage while satisfying the AC that the legacy file no longer references the batch model._
