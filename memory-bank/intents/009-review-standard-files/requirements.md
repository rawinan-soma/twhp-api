---
intent: 009-review-standard-files
phase: inception
status: complete
created: 2026-07-03T01:54:42.000Z
updated: 2026-07-03T02:03:00.000Z
---

# Requirements: Standard Files Visible in the Evaluation Step

## Intent Overview

During the evaluation/cover-review step, reviewers on **both** surfaces — tier-1 evaluators (Mental / DOH), ODPC evaluators, and DOED national admins — need to see the **factory's standard certification files** (the 11 standards declared at enrollment: HC, SAN, SAN+, Wellness, Safety, TIS18001, ISO45001, ISO14001, Zero, 5S, HAS). Today the cover-review read (`GET …/covers/:coverId/answers`) returns only per-**answer** evidence files; the factory's standard certificates live on the `enrolls` row (`fileStandard*Url` + `standard*` booleans) and are not surfaced in the review workflow.

This is a **brown-field enhancement** of `008-per-answer-verdict-save` / `003-evaluator-review`: extend the cover-review `/answers` response so a single call returns the answers **and** the factory's declared standard certificate files (with a per-standard "has" status). **Read-only, no schema change.** Files continue to be resolved on demand via the existing `/file/presigned-url` endpoint.

## Business Goals

| Goal | Success Metric | Priority |
| ---- | -------------- | -------- |
| Reviewers can verify a factory's declared standards during evaluation | Every tier-1/ODPC/DOED reviewer sees the factory's claimed standard certificates in the same cover-review call as the answers | Must |
| No cross-screen hop to inspect standards | The standard files arrive with the `/answers` payload — no separate enroll fetch required | Must |
| Parity across both review surfaces | Evaluators (`evaluators/covers/*`) and admins (`admins/covers/*`) return an identical standards payload (aside from region scoping) | Must |
| Preserve existing review behavior | The answers portion of the response is unchanged (region/category scope, projection, per-answer status) | Must |

---

## Functional Requirements

### FR-1: Factory standard files surfaced in the cover-review response
- **Description**: The cover-review read returns, alongside the answers, the factory's **declared** standard certificate files for that cover's enroll.
- **Acceptance Criteria**:
  - The response carries a `standards` collection; each item = `{ standard, fileName }` — `standard` is one of the 11 `standardTypes` enum values (e.g. `standardISO45001`) and `fileName` is the stored filename (**not** a presigned URL).
  - **Only standards the factory claimed (`standard* = true`) AND uploaded a file for (`fileStandard*Url` not null)** are included ("claimed + uploaded"). The list's membership **is** the "factory has this standard" status — no separate boolean flag (enrollment enforces claimed⟹file on both `create` and `update`, so a per-item `hasStandard` would always be `true`).
  - Standard keys align with the existing `standardTypes` pgEnum and `standardBoolMap`/`standardUrlMap` in `answer.ts` (single source of truth for the bool↔file pairing); the `standard` field is the enum key, not a display label (frontend owns Thai/EN labels).
  - The reviewer views a file by resolving its `fileName` through the existing `GET /file/presigned-url` endpoint (view-only; matches the per-answer evidence-file convention).
- **Priority**: Must
- **Related Stories**: TBD

### FR-2: `/answers` response shape becomes `{ answers, standards }`
- **Description**: The cover-review read response changes from a bare answer **array** to an **object** wrapping both collections, on both surfaces.
- **Acceptance Criteria**:
  - Response shape: `{ answers: AnswerViewItem[], standards: StandardFileItem[] }` where `StandardFileItem = { standard: <standardTypes enum>, fileName: string }`.
  - The `answers` array retains the **exact** prior `AnswerViewItem` shape, ordering, region/category scoping, and per-answer current status (this is a behaviour-preserving move of the existing array under an `answers` key).
  - The TypeBox response schema (`AnswerViewSchema`) is updated accordingly and a `StandardFileItem` schema is added.
  - This is a **breaking response-shape change**: API docs (`docs/api/*`) are regenerated and the cover-review integration tests + the `getAnswers` regression are updated to the new shape.
- **Priority**: Must
- **Related Stories**: TBD

### FR-3: Both review surfaces, identical standards behaviour
- **Description**: The standards payload is available on both the evaluator and admin cover-review reads and behaves identically.
- **Acceptance Criteria**:
  - `GET /twhp/api/evaluators/covers/:coverId/answers` (tier-1 + ODPC, region-scoped) and `GET /twhp/api/admins/covers/:coverId/answers` (DOED national, region-less) both return the `standards` collection.
  - Standard files are **factory-level, not category-scoped**: a tier-1 reviewer (whose *answers* are filtered to their category) still sees **all** of the factory's claimed standard files.
  - Region/cover-access rules are unchanged (existing `assertCoverAccess`): a reviewer who cannot access the cover gets the existing `404`; no standards leak.
- **Priority**: Must
- **Related Stories**: TBD

### FR-4: Read-only, sourced from the enroll, no schema change
- **Description**: Standards are derived by joining the cover to its enroll and reading the existing `standard*` booleans + `fileStandard*Url` columns.
- **Acceptance Criteria**:
  - No table/column/enum change; no new upload or mutation endpoint; the enrollment upload flow is untouched.
  - The read joins `covers → enrolls` (already available in the review service) and maps the 11 (bool, fileUrl) pairs, emitting only the claimed+uploaded ones.
  - No new N+1: standards are fetched in the same query path as the cover access / answers read.
- **Priority**: Must
- **Related Stories**: TBD

---

## Non-Functional Requirements

### Performance

| Requirement | Metric | Target |
| ----------- | ------ | ------ |
| Added read cost | Extra work per cover-review call | One additional enroll read (or a join) — no N+1, no per-file presigning |

### Security

| Requirement | Standard | Notes |
| ----------- | -------- | ----- |
| Authorization (cover) | Existing `assertCoverAccess` (region-scoped / national) | Reviewer must already have cover access; standards ride the same gate |
| File access | Existing `/file/presigned-url` (jwtPlugin) | View-only, 5-minute presigned URL; unchanged; only `fileName`s are exposed in the payload |
| Data exposure | Factory-declared standards only | Only claimed+uploaded standards are returned; not-claimed standards are omitted |

### Compatibility

| Requirement | Notes |
| ----------- | ----- |
| Breaking response shape | `/answers` becomes `{ answers, standards }`; frontend + docs + tests updated in lockstep (mirrors the bolt-021 docs/test-regression pattern) |

---

## Constraints

### Technical Constraints

**Project-wide standards**: loaded from `memory-bank/standards/` by the Construction Agent.

**Intent-specific constraints**:
- No database schema change (`enrolls` standard columns already exist).
- Reuse `standardBoolMap`/`standardUrlMap` (`answer.ts`) and the `standardTypes` enum — do not re-declare the bool↔file pairing.
- Routes stay thin; the review service returns `status(code, body)`.
- File resolution stays on the existing `/file/presigned-url` endpoint (no presigning inside `/answers`).

### Business Constraints

- Reviewers must not be able to *edit* standards — this is a view-only surfacing of the factory's enrollment data.

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
| ---------- | --------------- | ---------- |
| "Standard file" = the 11 enrollment standard certificates (`fileStandard*Url`), not per-answer evidence | Build surfaces the wrong artifact | Confirmed at Checkpoint 1 |
| Reviewers want only **claimed + uploaded** standards (not empty slots) | Reviewer can't see a claimed-but-missing certificate | Confirmed at Checkpoint 1; revisit if reviewers need to see gaps (see Open Questions) |
| The frontend can adopt the new `{ answers, standards }` shape | Breaking change strands the current UI | Coordinate the shape change with the frontend; regen docs; update tests |
| A cover maps to exactly one enroll (existing `covers.enrollId`) | Wrong factory's standards shown | Existing model guarantees one enroll per cover |
| Seed data has **no** standard files (`fileStandard*Url` null) — confirmed by the user | Integration tests have no standards to assert against | Construction phase seeds enroll standard files in its own test fixtures (as the bolt-020 finalize suite seeds its own data) |

---

## Resolved Decisions (grounded in current API state)

| Question | Decision | Evidence |
| -------- | -------- | -------- |
| Include a per-item `hasStandard` boolean? | **No** — return `{ standard, fileName }`; list membership = "has". | Enroll `create` (enroll.ts:220) & `update` (enroll.ts:452) both reject `claimed && no file` → a claimed standard always has a file → the flag is always `true`. |
| Standard label vs enum key? | **Enum key** (`standardTypes` value); frontend maps Thai/EN. | No standard display-label map exists server-side; API exposes enum keys elsewhere. |
| Inline presigned URL vs raw `fileName`? | **Raw `fileName`**, resolved via existing `/file/presigned-url`. | Matches the per-answer convention (`AnswerViewItem`: "Evidence filenames (not presigned URLs); resolve each via the file endpoint"). |

## Open Questions

| Question | Owner | Due Date | Resolution |
| -------- | ----- | -------- | ---------- |
| Prod CSV import (`migrate-prod`) bypasses the claimed⟹file guard, so a claimed-without-certificate row is possible in prod. Omit those (strictly claimed+uploaded) or include all claimed with `fileName: string\|null`? | User | Checkpoint 2 | **Resolved** — omit (strictly claimed+uploaded) |
