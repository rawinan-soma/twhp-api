---
unit: 001-per-answer-verdict-save
bolt: 021-per-answer-verdict-save
stage: model
status: complete
updated: 2026-07-02T08:52:00Z
---

# Static Model - Two-Phase Review over HTTP (presentation / transport)

## Bounded Context

The **Evaluator Review** context, **presentation/transport side** — the third and final bolt of the unit. It introduces **no new domain concepts**: the write model (`saveAnswerVerdict`) is bolt 019 and the finalize model (`finalize`) is bolt 020. This bolt exposes those existing domain services over HTTP on **two surfaces**, retires the legacy batch endpoint (and `VerdictBatchSchema`), and regenerates the docs + restructures the integration tests to match. The domain rules, entities, aggregates, and events are entirely **inherited** from bolts 019/020.

Scope = stories **005-save-and-finalize-routes**, **006-admin-surface-parity**, **007-answers-list-and-docs-regression**.

The "static model" for a transport bolt is therefore the **endpoint contract**: which route maps to which command, how each surface resolves its reviewer, and the thin-route invariant. It is documented here for completeness; no new aggregates are born.

## Domain Entities

_No new domain entities._ The transport layer manipulates the same aggregates through the existing services:

| Entity | Origin | Role in this bolt |
| ------ | ------ | ----------------- |
| **Answer / AnswerLog** | bolt 019 | Target of the save route; read (unchanged) by `GET …/answers`. |
| **Cover / CoverLog** | bolt 020 | Target of the finalize route. |
| _(no rows written or read directly by routes — routes delegate to services)_ | — | Routes own **no** persistence. |

## Value Objects

| Value Object | Properties | Constraints |
| ------------ | ---------- | ----------- |
| **Surface** | `evaluators` \| `admins` | The two review surfaces. Both expose the **same** save + finalize behavior; they differ only in reviewer resolution and cover-access scope. |
| **PathIdentity** | `coverId: number`, `answerId: number` (save only) | Validated by TypeBox as numbers (`t.Object({ coverId: t.Number(), answerId: t.Number() })`); a non-numeric param → `400`. |
| **SaveRequestBody** | `VerdictEntry` (single object) | Reuses `VerdictSaveBodySchema` (bolt 019). Not an array — one verdict per request. |
| **FinalizeRequestBody** | `{}` | `FinalizeSchema` (bolt 019); empty body. |
| **ReviewerResolution** | strategy per surface | `evaluators` → `resolveEvaluator(callerId)` (level + region, region-scoped access). `admins` → `adminReviewerContext(callerId)` (level `ODPC`, `region: null`, existence-only access). |
| **FinalizeAuthority** | derived gate | Finalize is permitted iff the resolved reviewer's `level === "ODPC"`. On the evaluator surface a tier-1 caller → `403`; on the admin surface every caller is ODPC by construction. |
| **EndpointContract** | `{ method, path, requestBody, responseCodes }` | Each route declares OpenAPI `detail` + `response` covering `200/400/403/404`; the body validation `400` and service `status(4xx)` are surfaced verbatim. |

## Aggregates

_No new aggregates._ The **Cover** aggregate (finalization) and the **Answer** aggregate (verdict history) are owned by the service layer (bolts 020/019). The transport layer holds one **invariant of its own**:

| Boundary | Members | Invariant |
| -------- | ------- | --------- |
| **Thin route** | one autoloaded route file per (surface × command) | (1) A route contains **no business logic** — it resolves a `ReviewerContext`, calls exactly one service method, and returns the service's `status(code, body)` directly. (2) Both surfaces call the **one** `evaluatorReviewService` singleton — no duplicated logic. (3) The evaluator/admin outcomes are identical aside from region scoping. (4) The legacy batch route and `VerdictBatchSchema` no longer exist after this bolt. (5) `GET …/answers` is untouched (the resume source). |

## Domain Events

_No new domain events._ All events (`AnswerVerdictSaved`, `RecommendedPromotedToFinished`, `CoverFinalized`/`CoverReturnedForRevision`, `HardRejectFilesDeleted`, `FactoryNotified`) are emitted by the services invoked (bolts 019/020). The transport layer emits none; it only translates HTTP ⇄ service calls.

## Domain Services

| Service (existing) | Operations | Exposed by |
| ------------------ | ---------- | ---------- |
| **evaluatorReviewService.saveAnswerVerdict** | `(coverId, answerId, reviewer, entry)` | `POST …/{surface}/covers/:coverId/answers/:answerId/verdict` |
| **evaluatorReviewService.finalize** | `(coverId, reviewer)` | `POST …/{surface}/covers/:coverId/finalize` (ODPC/admin only) |
| **evaluatorReviewService.getAnswers** | `(coverId, reviewer)` | `GET …/{surface}/covers/:coverId/answers` — **unchanged** |
| **resolveEvaluator** | `(callerId)` → `ReviewerContext` \| `404` | evaluator surface reviewer resolution |
| **adminReviewerContext** | `(callerId)` → ODPC/region-null `ReviewerContext` | admin surface reviewer resolution |

_All five already exist; bolt 021 wires routes to them and removes the batch method's route._

## Repository Interfaces

_None._ The transport layer performs no data access; persistence contracts remain those of bolts 019/020.

## Ubiquitous Language

| Term | Definition |
| ---- | ---------- |
| **Surface** | One of the two review front-doors: `evaluators/covers/*` (region-scoped tier-1 + ODPC) and `admins/covers/*` (DOED admin as national ODPC). |
| **Thin route** | A route that resolves a reviewer and delegates to the singleton service, returning its `status()` verbatim — no business logic. |
| **Reviewer resolution** | Turning the authenticated caller into a `ReviewerContext`: `resolveEvaluator` (evaluator) vs `adminReviewerContext` (admin, national). |
| **Admin-as-national-ODPC** | A DOED admin reviewing with ODPC authority and `region: null` (existence-only cover access, all categories). |
| **Finalize authority** | The ODPC-only permission to finalize; a tier-1 evaluator hitting the evaluator finalize route → `403`. |
| **Batch retirement** | Removing the old `POST …/verdict` batch route and `VerdictBatchSchema` (and the "duplicate answerId" `400`) — the last step making "only finalize writes finished" literally true project-wide. |
| **Resume source** | `GET …/answers`, returning each Answer's current status; unchanged so a partially reviewed Cover can be resumed. |
| **Docs regen** | Regenerating `docs/api/openapi.json` / `API.md` / `index.html` from the route/OpenAPI definitions after the routes change. |
