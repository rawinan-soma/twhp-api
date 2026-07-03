---
unit: 001-review-standard-files
bolt: 022-review-standard-files
stage: model
status: complete
updated: 2026-07-03T02:28:19Z
---

# Static Model - Standard Files in the Cover-Review Read

## Bounded Context

The **Evaluator Review** context, **read side** — a read-only projection added to the cover-review view (`getAnswers`, delivered by intent 008 bolt 021). It introduces **no new persistent entity, aggregate, or event**: it derives a view of the factory's declared standard certificates from the existing `Cover → Enroll` relationship and returns them alongside the answers. The only change to the aggregate's *behaviour* is a new read projection; nothing is written.

Scope = stories **001-standard-file-dto**, **002-standards-service-enrichment**, **003-both-surface-response**, **004-docs-and-test-regression**.

## Domain Entities

_No new entities._ The projection reads existing rows:

| Entity | Origin | Role in this bolt |
| ------ | ------ | ----------------- |
| **Cover** | existing | The review target; maps 1:1 to an Enroll via `covers.enrollId`. Read-only here. |
| **Enroll** | existing | Holds the factory's 11 standard declarations: for each standard a `standard*` boolean + a `fileStandard*Url` filename. Read-only source of the standards projection. |
| **Answer / AnswerLog** | existing (bolt 019/021) | Unchanged; the `answers` half of the view is a behaviour-preserving passthrough. |

## Value Objects

| Value Object | Properties | Constraints |
| ------------ | ---------- | ----------- |
| **StandardType** | one of the 11 `standardTypes` enum keys (`standardHC`, `standardSAN`, `standardSANPlus`, `standardWellness`, `standardSafety`, `standardTIS18001`, `standardISO45001`, `standardISO14001`, `standardZero`, `standard5S`, `standardHAS`) | The single source of truth for a standard's identity; must not be re-declared — it is the existing pgEnum, paired to its (bool, fileUrl) columns by `standardBoolMap`/`standardUrlMap` (`answer.ts`). |
| **StandardFile** | `{ standard: StandardType, fileName: string }` | `fileName` is the **stored filename**, not a presigned URL. Emitted only for a **claimed + uploaded** standard. Immutable. |
| **ClaimedUploaded** (inclusion predicate) | over one (bool, fileUrl) pair | A standard is included iff `standard* === true` **and** `fileStandard*Url != null`. Not-claimed → excluded; claimed-without-file (possible via CSV import) → excluded. |
| **StandardsProjection** | ordered `StandardFile[]` for a Cover's Enroll | Derived purely from the Enroll's 11 (bool, fileUrl) pairs via `standardBoolMap`/`standardUrlMap`, filtered by `ClaimedUploaded`. **Factory-level** — no category scoping. |
| **CoverReviewView** | `{ answers: AnswerViewItem[], standards: StandardFile[] }` | The new response shape. `answers` is the **unchanged** prior array (same projection/scoping/status) moved under a key; `standards` is the new sibling. Present even when `answers` is empty. |
| **ReviewerContext** | `{ accountId, level, region \| null }` | Existing. Gates *cover access* (region-scoped / national) but **not** the standards set — every reviewer with cover access sees all claimed standards. |

## Aggregates

_No new aggregate._ The projection reads across the existing **Cover** aggregate (Cover + its Enroll + its Answers). One invariant governs the read:

| Boundary | Members | Invariant |
| -------- | ------- | --------- |
| **Cover-review view** | `Cover` + its `Enroll` (standards) + its in-scope `Answer`s | (1) `standards` is a **pure function** of the Enroll's (bool, fileUrl) pairs under `ClaimedUploaded` — read-only, no mutation. (2) `standards` is **factory-level**: never filtered by the reviewer's category scope (unlike `answers`). (3) The view is gated by the existing `assertCoverAccess`; an inaccessible cover yields the existing `404` and leaks no standards. (4) `answers` behaviour (projection, region + category filter, per-answer status) is **unchanged**; only the wrapping changes. (5) `standards` is returned even when `answers` is empty. |

## Domain Events

_None._ The read is side-effect-free: no writes, no file I/O (certificates are fetched later via the existing `/file/presigned-url`), no email.

## Domain Services

| Service | Operations | Dependencies |
| ------- | ---------- | ------------ |
| **CoverReviewReadService** (existing `getAnswers`, enriched) | `getAnswers(coverId, reviewer)` → `CoverReviewView` \| `404` | CoverAccessRepository, AnswerReadRepository (unchanged), EnrollStandardsRepository, StandardsProjectionPolicy |
| **StandardsProjectionPolicy** (pure) | `project(enrollStandards)` → `StandardFile[]` | `standardBoolMap`/`standardUrlMap` (the (key → bool-col, url-col) pairing); applies `ClaimedUploaded` |

**`getAnswers` ordered rules** (returns `status(code, body)`; never throws):
1. Cover access — `assertCoverAccess(coverId, reviewer.region)` → else existing `404`.
2. Answers — build the existing category/region-scoped `AnswerViewItem[]` (unchanged), including the empty-list early path.
3. Standards — read the Cover's Enroll (bool + fileUrl for all 11), `StandardsProjectionPolicy.project(...)` → claimed+uploaded `StandardFile[]`.
4. Return `{ answers, standards }`.

## Repository Interfaces

| Repository | Entity | Methods |
| ---------- | ------ | ------- |
| **CoverAccessRepository** | Cover | `assertCoverAccess(coverId, region)` → ok \| `404` (existing; region-scoped / national) |
| **AnswerReadRepository** | Answer / AnswerLog | existing scoped-answers read → `AnswerViewItem[]` (unchanged) |
| **EnrollStandardsRepository** | Enroll | `getStandards(coverId)` → the 11 `(standardKey, bool, fileUrl)` triples for the cover's enroll (single read/join; no N+1) |

_The existing Drizzle-backed `covers → enrolls` join satisfies `EnrollStandardsRepository`; no schema change._

## Ubiquitous Language

| Term | Definition |
| ---- | ---------- |
| **Standard file** | A factory's uploaded certificate for one of the 11 declared standards (`fileStandard*Url` on the enroll); surfaced as `{ standard, fileName }`. |
| **Claimed + uploaded** | The inclusion rule: the factory marked the standard true **and** a certificate filename is present. The only standards returned. |
| **Standards projection** | The read-only derivation of the claimed+uploaded `StandardFile[]` from the enroll, via `standardBoolMap`/`standardUrlMap`. |
| **Factory-level** | Standards belong to the factory/enroll, not a question category — every reviewer with cover access sees all of them (contrast: category-scoped `answers`). |
| **Cover-review view** | The enriched response `{ answers, standards }` returned by `getAnswers` on both review surfaces. |
| **File resolution** | Turning a returned `fileName` into a viewable 5-minute URL via the existing `GET /file/presigned-url` — done later by the client, not in this read. |
