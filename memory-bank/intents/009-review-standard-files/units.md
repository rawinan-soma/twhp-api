---
intent: 009-review-standard-files
phase: inception
created: 2026-07-03T01:54:42Z
---

# Units: Standard Files Visible in the Evaluation Step

## Project Type: backend-api
Decomposition: domain-driven. A single unit that enriches the read path of the existing **evaluation/review** domain (`008-per-answer-verdict-save`, unit `001-per-answer-verdict-save`). No frontend unit. No schema migration. Internal sequencing handled by the bolt plan.

## Units

| Unit | Purpose | FRs | Priority | Bolt Type |
|------|---------|-----|----------|-----------|
| `001-review-standard-files` | Extend the cover-review read so `GET …/covers/:coverId/answers` returns `{ answers, standards }`, where `standards` is the factory's claimed+uploaded standard certificate files (`{ standard, fileName }`), on both review surfaces; regen docs; update tests | FR-1 to FR-4 | Must | ddd-construction-bolt |

## Requirement-to-Unit Mapping

- **FR-1** Factory standard files surfaced in the cover-review response → `001-review-standard-files`
- **FR-2** `/answers` response shape becomes `{ answers, standards }` → `001-review-standard-files`
- **FR-3** Both review surfaces, identical standards behaviour → `001-review-standard-files`
- **FR-4** Read-only, sourced from the enroll, no schema change → `001-review-standard-files`

## Dependency Graph

    001-review-standard-files
      ├── enriches: 008-per-answer-verdict-save / 001-per-answer-verdict-save (evaluatorReviewService.getAnswers)
      ├── reuses: covers→enrolls join, standardTypes enum + standardBoolMap/standardUrlMap (answer.ts) — NO schema change
      ├── reuses: assertCoverAccess (region/national), evalGuard + adminGuard, /file/presigned-url
      └── touches: both cover-review /answers routes (evaluators + admins), docs/api/*, cover-review integration tests

No schema is migrated; no other intent is modified destructively. This unit adds a read-only projection to the cover-review response established by `008` bolt 021.

## Why one unit

The DTO shape change, the service enrichment, the two route response updates, and the docs/test regression all operate on the **same** cover-review read (`getAnswers`) and the **same** `covers/enrolls` aggregate. They are one cohesive read-path concern; splitting them across units would fragment a single vertical slice. The bolt plan sequences DTO+service before routes+docs+tests within one bolt.
