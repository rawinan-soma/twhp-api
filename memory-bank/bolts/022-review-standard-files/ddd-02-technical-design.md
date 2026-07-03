---
unit: 001-review-standard-files
bolt: 022-review-standard-files
stage: design
status: complete
updated: 2026-07-03T02:33:00Z
---

# Technical Design - Standard Files in the Cover-Review Read

## Architecture Pattern

**Existing ElysiaJS autoload monolith, unchanged.** A read-only enrichment of the singleton `evaluatorReviewService.getAnswers`: it returns `{ answers, standards }` instead of `AnswerViewItem[]`, deriving `standards` from the cover's enroll. No new module, no new architectural pattern, **no schema change**. Services return `status(code, body)`; routes stay thin.

## Layer Structure

```text
┌─────────────────────────────┐
│      Presentation           │  evaluators + admins covers/[coverId]/answers routes
│                             │   (response schema → the new object shape)
├─────────────────────────────┤
│      Application/Domain      │  evaluator-review.ts: getAnswers (returns { answers, standards })
│                             │   + StandardsProjection (pure) over standardBoolMap/standardUrlMap
├─────────────────────────────┤
│     Infrastructure          │  Drizzle: covers → enrolls read (standard bools + fileStandard*Url)
└─────────────────────────────┘
```

## Component Design (bolt scope)

### Story 001 — DTO (`src/schema/evaluator-review.ts`)
- Add a standard-key schema from the existing enum (do not hand-list a divergent set):
  ```
  StandardKeySchema = t.Union(standardTypes.enumValues.map((v) => t.Literal(v)))
  ```
  (build the literal union from `standardTypes.enumValues`; if a tuple is required, spread into `t.Union([...])`.)
- Add `StandardFileItemSchema = t.Object({ standard: StandardKeySchema, fileName: t.String() })`.
- Change `AnswerViewSchema` from `t.Array(AnswerViewItemSchema)` to:
  ```
  AnswerViewSchema = t.Object({
    answers:   t.Array(AnswerViewItemSchema),
    standards: t.Array(StandardFileItemSchema),
  })
  ```
- `AnswerViewItemSchema` is **unchanged**. Only the two cover-review answer routes import `AnswerViewSchema`, so redefining it propagates the new shape to both surfaces (see Story 003).
- Export `StandardFileItemSchema` (+ its `Static` type) for the service/tests.

### Story 002 — `getAnswers` enrichment (service)
Signature change:
```
getAnswers(coverId, reviewer) → status(200, { answers, standards }) | status(404, { message })   // 404 unchanged
```
Ordered flow (extends the existing method):
1. `assertCoverAccess(coverId, reviewer.region)` → unchanged `404` on failure.
2. **Standards read** — a dedicated read of the cover's enroll standard columns:
   ```
   select { <11 standard bools>, <11 fileStandard*Url> } from enrolls
     innerJoin covers on covers.enrollId = enrolls.id
     where covers.id = coverId  limit 1
   ```
   (one row; no N+1.)
3. **Projection (pure)** — `standardFilesFromEnroll(enrollRow)`: over the authoritative pairing (below), emit `{ standard, fileName: enrollRow[urlCol] }` **iff** `enrollRow[boolCol] === true && enrollRow[urlCol] != null`.
4. Build `answers` exactly as today (category/region scope, latest-log status), **including** the empty-answers path — which now returns `{ answers: [], standards }` (standards computed in step 2–3, before/independent of the answers query).
5. `return status(200, { answers, standards })`.

**Projection source (resolved from `answer.ts`)**: `standardBoolMap`/`standardUrlMap` are **local, non-exported** consts re-declared inline 3× in `answer.ts`, each built from a fetched `enroll` row; they map the 11 `standardTypes` keys → `enroll.standard*` / `enroll.fileStandard*Url` columns. Because the enum key ≠ column name (`standardHC` → `standardHc`/`fileStandardHcUrl`; `standardTIS18001` → `standardTis18001`), an **explicit 11-entry key→(boolCol, urlCol) pairing is required** (cannot be derived from `standardTypes.enumValues` alone). This bolt introduces **one** authoritative, exported pairing + `standardFilesFromEnroll(enroll)` helper (single source of truth for the new code) rather than a 4th inline copy; `getAnswers` uses it. `answer.ts`'s inline copies serve a different computation (question↔standard match) and are **left untouched** (optional future dedup — out of scope).

```
STANDARD_ENROLL_COLUMNS = [
  { standard: "standardHC",       bool: "standardHc",       url: "fileStandardHcUrl" },
  { standard: "standardSAN",      bool: "standardSan",      url: "fileStandardSanUrl" },
  { standard: "standardSANPlus",  bool: "standardSanPlus",  url: "fileStandardSanPlusUrl" },
  { standard: "standardWellness", bool: "standardWellness", url: "fileStandardWellnessUrl" },
  { standard: "standardSafety",   bool: "standardSafety",   url: "fileStandardSafetyUrl" },
  { standard: "standardTIS18001", bool: "standardTis18001", url: "fileStandardTis18001Url" },
  { standard: "standardISO45001", bool: "standardIso45001", url: "fileStandardIso45001Url" },
  { standard: "standardISO14001", bool: "standardIso14001", url: "fileStandardIso14001Url" },
  { standard: "standardZero",     bool: "standardZero",     url: "fileStandardZeroUrl" },
  { standard: "standard5S",       bool: "standard5S",       url: "fileStandard5SUrl" },
  { standard: "standardHAS",      bool: "standardHas",      url: "fileStandardHasUrl" },
]  // as const; keys verified against schema.ts enrolls + standardTypes
```

**Placement**: the pairing + `standardFilesFromEnroll` live in the service layer (`evaluator-review.ts`, or a small shared `standards.ts` if `answer.ts` later adopts it). Stage-4 verifies the 11 column names against `schema.ts`.

### Story 003 — both-surface response
- Both `src/routes/{evaluators,admins}/covers/[coverId]/answers/index.ts` already declare `response: { 200: AnswerViewSchema, 404: … }`. Because `AnswerViewSchema` is redefined (Story 001), **both routes return the new object shape with no handler change** — routes still `return getAnswers(...)` directly.
- Verify no other importer of `AnswerViewSchema` exists (expected: only these two routes). No new route logic; reviewer resolution + `assertCoverAccess` unchanged.

### Story 004 — docs + test regression
- Regen `docs/api/*` (start app → dump `document/json` → `bun run scripts/gen-api-docs.ts`).
- Update the cover-review integration tests + the intent-008 `getAnswers` regression to the `{ answers, standards }` shape; **seed** enroll `standard*` + `fileStandard*Url` in fixtures.

## API Design

| Endpoint | Method | Response (changed) | Story |
|----------|--------|--------------------|-------|
| `…/evaluators/covers/:coverId/answers` | GET | `200 { answers: AnswerViewItem[], standards: StandardFileItem[] }` / `404 {message}` | 003 (via 001) |
| `…/admins/covers/:coverId/answers` | GET | same object shape | 003 (via 001) |

`StandardFileItem = { standard: <standardTypes>, fileName: string }`.

## Data Persistence

| Table | Access | Notes |
|-------|--------|-------|
| `Enrolls` | **read** 11 `standard*` bools + 11 `fileStandard*Url` for the cover's enroll | Via `covers → enrolls` join; one row; **no schema change**. |
| `Answers`/`AnswerLogs`/`Questions` | **read** (unchanged) | Existing scoped-answers projection, untouched. |

No writes.

## Security Design

| Concern | Approach |
|---------|----------|
| Authorization (cover) | Existing `assertCoverAccess` (region-scoped / national). Standards ride the same gate; inaccessible cover → existing `404`, no standards leaked. |
| Category scope | Standards are **factory-level** — deliberately *not* filtered by the reviewer's answer-category scope. |
| File access | Unchanged `/file/presigned-url` (jwt). Only `fileName`s are exposed here; presigning happens later at view time. |
| Data exposure | Only claimed+uploaded standards emitted; not-claimed and claimed-without-file are omitted. |

## NFR Implementation

| Requirement | Approach |
|-------------|----------|
| Performance | One extra single-row enroll read; pure O(11) projection; no per-file presigning; no N+1. |
| Consistency (two surfaces) | Single `AnswerViewSchema` + single `getAnswers` → identical payload on both surfaces by construction. |
| Backward-safety | `answers` item shape/scoping unchanged; only the wrapper is new (breaking shape, but answers semantics preserved). |

## Error Handling

| Case | Code |
|------|------|
| Cover inaccessible / not found | 404 (existing `assertCoverAccess`) |
| (No new error paths) | — |

## External Dependencies

_None new._ Postgres read only; MinIO/BullMQ/SMTP untouched (files resolved later via existing `/file`).

## Testing Approach (executed in Stage 5)

Integration tests on the live-Postgres harness (per bolts 019–021), seeding enroll standard files:
- `getAnswers` returns `{ answers, standards }`; `answers` unchanged (region/category scope, per-answer status).
- `standards` = claimed+uploaded only: a seeded claimed+file standard is present; a claimed-but-null-file standard is **absent**; an unclaimed standard (even with a stray file) is **absent**.
- Tier-1 (category-scoped answers) still sees **all** claimed standards.
- Empty-answers cover still returns `{ answers: [], standards: [...] }`.
- Both surfaces identical (evaluator-ODPC vs admin region-null) aside from access.
- Inaccessible cover → `404`.
- Update the intent-008 `getAnswers` regression to the new shape; full evaluator-review suite green.
