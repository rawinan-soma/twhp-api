---
unit: 001-review-standard-files
intent: 009-review-standard-files
phase: inception
status: complete
unit_type: backend
default_bolt_type: ddd-construction-bolt
created: 2026-07-03T01:54:42.000Z
updated: 2026-07-03T01:54:42.000Z
---

# Unit Brief: Standard Files in the Cover-Review Read

## Purpose

Enrich the cover-review read (`GET …/covers/:coverId/answers`) so a single call returns the factory's **claimed + uploaded** standard certificate files alongside the answers, on **both** review surfaces (evaluators = tier-1 + ODPC; admins = DOED national). Reviewers can then verify a factory's declared standards during evaluation without a separate enroll fetch. **Read-only, no schema migration.**

## Scope

### In Scope

- **Schema/DTO** (`src/schema/evaluator-review.ts`): add `StandardFileItemSchema = { standard, fileName }`; change the cover-review response from `AnswerViewSchema` (bare array) to an object `{ answers: AnswerViewItem[], standards: StandardFileItem[] }` (behaviour-preserving move of the array under `answers`).
- **Service** (`evaluatorReviewService.getAnswers`): return `{ answers, standards }`. Read the cover's enroll (`covers → enrolls`) and, for each of the 11 standards, emit `{ standard: <standardTypes key>, fileName }` **only** where the bool is `true` and the `fileStandard*Url` is not null. Reuse the `standardTypes` enum + `standardBoolMap`/`standardUrlMap` pairing (`answer.ts`) as the single source of truth; do not re-declare the bool↔file mapping. The empty-answers early-return must still include `standards`.
- **Routes** (both surfaces): update the response schema of `evaluators/covers/[coverId]/answers` and `admins/covers/[coverId]/answers` to the new object shape; routes stay thin.
- **Docs + regression**: regen `docs/api/*` (openapi/API.md/index.html); update the cover-review integration tests and the `getAnswers` regression to the `{ answers, standards }` shape (**seed enroll standard files** in fixtures — seed data has none).

### Out of Scope

- Any schema migration (`enrolls` columns already exist).
- Category-scoping of standards (they are factory-level — all reviewers see all claimed standards).
- Claimed-but-unuploaded "gap" visibility (omitted per requirements Open Questions; would be a nullable-`fileName` variant).
- Standard label/i18n (frontend owns Thai/EN); inline presigning inside `/answers` (files resolved via existing `/file/presigned-url`).
- Any change to answers filtering, verdict save, or finalize.

---

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Factory standard files surfaced in the cover-review response | Must |
| FR-2 | `/answers` response shape becomes `{ answers, standards }` | Must |
| FR-3 | Both review surfaces, identical standards behaviour | Must |
| FR-4 | Read-only, sourced from the enroll, no schema change | Must |

## Interface (how other code interacts)

- `evaluatorReviewService.getAnswers(coverId, reviewer)` returns `{ answers, standards }` instead of `AnswerViewItem[]`; both cover-review routes return it directly. Reviewer resolution (`resolveEvaluator` / `adminReviewerContext`) and `assertCoverAccess` are unchanged.
- `standards` items carry the `standardTypes` enum key + the stored `fileName`; the frontend resolves each via `GET /file/presigned-url` (existing).

## Dependencies

- Existing model: `covers`, `enrolls` (standard bools + `fileStandard*Url`), `answers`, `answerLogs`, `questions`.
- Existing code enriched, not replaced: `src/service/evaluator-review.ts` (`getAnswers`), `src/schema/evaluator-review.ts`, `src/routes/{evaluators,admins}/covers/[coverId]/answers/index.ts`.
- Reuses: `standardTypes` enum, `standardBoolMap`/`standardUrlMap` (`answer.ts`), `assertCoverAccess`, `/file/presigned-url`.

## Key Risks

- **Breaking response shape**: `/answers` moves from array to `{ answers, standards }` — the frontend, docs, and the just-written `getAnswers` regression (intent 008 bolt 021) must update in lockstep.
- **Mapping drift**: the bool↔file pairing must come from the existing `standardBoolMap`/`standardUrlMap`, not a re-declared list, to stay in sync with `standardTypes` and `seed_data/questions.json`.
- **Two surfaces**: evaluator and admin responses must be identical (aside from region scoping); the empty-answers path must still return `standards`.
- **No seed data**: tests must seed enroll standard files themselves.

---

## Story Summary

- **Total Stories**: 4
- **Must Have**: 4

### Stories

- [ ] **001-standard-file-dto**: `StandardFileItem` schema + `{ answers, standards }` response shape - Must - Planned
- [ ] **002-standards-service-enrichment**: `getAnswers` returns claimed+uploaded standards from the enroll - Must - Planned
- [ ] **003-both-surface-response**: update evaluator + admin `/answers` route response schemas - Must - Planned
- [ ] **004-docs-and-test-regression**: regen docs; update cover-review tests + `getAnswers` regression (seed standard files) - Must - Planned
