---
id: 022-review-standard-files
unit: 001-review-standard-files
intent: 009-review-standard-files
type: ddd-construction-bolt
status: complete
stories:
  - 001-standard-file-dto
  - 002-standards-service-enrichment
  - 003-both-surface-response
  - 004-docs-and-test-regression
created: 2026-07-03T01:54:42.000Z
started: 2026-07-03T02:28:19.000Z
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-07-03T02:33:00.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-07-03T02:40:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-07-03T02:40:00.000Z
    artifact: none (skipped — read-only projection, no ADR-worthy decision)
  - name: implement
    completed: 2026-07-03T02:55:00.000Z
    artifact: schema/service (getAnswers → {answers,standards}) + docs regen
  - name: test
    completed: 2026-07-03T03:09:18.000Z
    artifact: ddd-03-test-report.md (+ evaluator-review.standards.integration.test.ts; 50/50 evaluator-review tests)
requires_bolts:
  - 021-per-answer-verdict-save
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
completed: "2026-07-03T03:09:18Z"
---

# Bolt: 022-review-standard-files

## Overview

Read-only enrichment of the cover-review read: `GET …/covers/:coverId/answers` returns `{ answers, standards }`, where `standards` is the factory's claimed+uploaded standard certificate files. One cohesive vertical slice — DTO shape change, service enrichment, both route responses, docs + test regression.

## Objective

Change the cover-review response from a bare answer array to `{ answers, standards }`; derive `standards` (`{ standard, fileName }`, claimed+uploaded only) from the cover's enroll via `standardBoolMap`/`standardUrlMap`; mirror the response on both surfaces; regenerate docs; update the cover-review tests + the `getAnswers` regression (seeding standard files).

## Stories Included

- [ ] **001-standard-file-dto**: `StandardFileItem` schema + `{ answers, standards }` response shape (Must)
- [ ] **002-standards-service-enrichment**: `getAnswers` returns claimed+uploaded standards from the enroll (Must)
- [ ] **003-both-surface-response**: evaluator + admin `/answers` route response schemas updated (Must)
- [ ] **004-docs-and-test-regression**: regen docs; update cover-review tests + `getAnswers` regression (seed standard files) (Must)

## Bolt Type

**Type**: DDD Construction Bolt

## Stages

- [ ] **1. model**: `StandardFile` value object (`standard` key + `fileName`); the "claimed + uploaded" inclusion predicate; the `{ answers, standards }` read projection over the `covers/enrolls` aggregate; factory-level (not category-scoped) rule
- [ ] **2. design**: DTO shape (`StandardFileItemSchema` + wrap `AnswerViewSchema`); `getAnswers` return change + enroll read via `standardBoolMap`/`standardUrlMap`; both route response maps; docs regen + test/seed approach
- [ ] **3. implement**: `schema/evaluator-review.ts` DTOs; `getAnswers` enrichment; both `covers/[coverId]/answers/index.ts` route responses; regen `docs/api/*`
- [ ] **4. test**: cover-review integration tests to the new shape (seed enroll standard files); claimed+uploaded filter (exclude not-claimed and claimed-without-file); tier-1 sees all standards; empty-answers still returns `standards`; `getAnswers` regression updated; suite green

## Dependencies

### Requires
- 021-per-answer-verdict-save (the cover-review `/answers` routes + `getAnswers` this bolt enriches)

### Enables
- (none — final bolt of the intent)

## Success Criteria

- [ ] `GET …/covers/:coverId/answers` returns `{ answers, standards }` on both surfaces
- [ ] `standards` = claimed+uploaded only, `{ standard: <standardTypes>, fileName }`, factory-level
- [ ] `answers` projection/scoping unchanged; empty-answers still returns `standards`
- [ ] `docs/api/*` regenerated; cover-review tests + `getAnswers` regression pass (with seeded standard files)

## Notes

- No schema migration; reuse `standardTypes` + `standardBoolMap`/`standardUrlMap` (do not re-declare the bool↔file pairing).
- Breaking response-shape change — coordinate frontend; docs + tests updated in lockstep (mirrors bolt 021).
- Seed data has no standard files — the test stage seeds them in fixtures.
