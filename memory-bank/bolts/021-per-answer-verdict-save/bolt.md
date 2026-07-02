---
id: 021-per-answer-verdict-save
unit: 001-per-answer-verdict-save
intent: 008-per-answer-verdict-save
type: ddd-construction-bolt
status: complete
stories:
  - 005-save-and-finalize-routes
  - 006-admin-surface-parity
  - 007-answers-list-and-docs-regression
created: 2026-07-02T00:00:00.000Z
started: 2026-07-02T08:52:00.000Z
current_stage: null
stages_completed:
  - name: domain-model
    completed: 2026-07-02T08:55:00.000Z
    artifact: ddd-01-domain-model.md
  - name: technical-design
    completed: 2026-07-02T08:58:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-07-02T08:58:00.000Z
    artifact: none (skipped — covered by ADR-0005)
  - name: implement
    completed: 2026-07-02T09:05:00.000Z
    artifact: routes (evaluators/admins save+finalize), batch removal, docs regen
  - name: test
    completed: 2026-07-02T09:20:11.000Z
    artifact: ddd-03-test-report.md (verdict/finalize suite renamed; 44/44 evaluator-review tests)
requires_bolts:
  - 020-per-answer-verdict-save
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 3
  testing_scope: 3
completed: "2026-07-02T09:20:11Z"
---

# Bolt: 021-per-answer-verdict-save

## Overview

Expose the two-phase model over HTTP on both review surfaces, retire the batch route, then regenerate API docs and restructure the integration tests to match.

## Objective

Wire `POST …/answers/:answerId/verdict` + `POST …/finalize` under `evaluators/covers/*` and `admins/covers/*` (admin-as-national-ODPC), remove the batch `verdict` routes, regen `docs/api/*`, and restructure the two integration test files — confirming `GET …/answers` is unchanged.

## Stories Included

- [ ] **005-save-and-finalize-routes**: new save + finalize routes (evaluators); remove batch route (Must)
- [ ] **006-admin-surface-parity**: mirror both routes under admins/covers/* via `adminReviewerContext` (Must)
- [ ] **007-answers-list-and-docs-regression**: GET answers unchanged; regen API docs; restructure tests (Must)

## Bolt Type

**Type**: DDD Construction Bolt

## Stages

- [ ] **1. model**: Route → service mapping for both surfaces; ODPC-only finalize gate; thin-route contract (no business logic)
- [ ] **2. design**: Autoload paths (`.../answers/[answerId]/verdict`, `.../finalize`) for both surfaces; reviewer resolution (`resolveEvaluator` vs `adminReviewerContext`); OpenAPI `detail`/`response` codes
- [ ] **3. implement**: Add/remove route files under `src/routes/{evaluators,admins}/covers/[coverId]/…`; regen `docs/api/openapi.json`/`API.md`/`index.html`
- [ ] **4. test**: Restructure `evaluator-review.integration.test.ts` (save) + `.verdict.integration.test.ts` (finalize); evaluator/admin parity; tier-1 finalize `403`; removed-batch path `404`; `GET answers` regression; full suite green

## Dependencies

### Requires
- 020-per-answer-verdict-save

### Enables
- (none — final bolt)

## Success Criteria

- [ ] Both surfaces expose identical save + finalize behavior; finalize ODPC/admin only
- [ ] Batch `verdict` route + `VerdictBatchSchema` fully removed
- [ ] `docs/api/*` regenerated; `GET …/answers` unchanged
- [ ] Integration suite passes with per-Answer save + separate finalize cases

## Notes

- Routes stay thin — services return `status(code, body)`, routes return directly.
- Coordinates with the in-flight `admins/covers` route migration in the working tree.
