---
stage: test
bolt: 011-admin-as-evaluator
created: 2026-06-19T01:40:07Z
---

## Test Report: admin-as-evaluator (seam + admin answers read)

### Summary

- **Unit/Integration tests (this bolt)**: 10/10 passed (`src/service/evaluator-review.integration.test.ts`)
- **Full project suite**: 95 pass, 1 fail — the single failure is a **pre-existing**,
  unrelated assertion in `src/service/score.integration.test.ts` (`scoring.total.maxScore`
  NaN fixture), present before this bolt and untouched by it.
- **Typecheck**: `bunx tsc --noEmit` — **0 errors** in all bolt-011 files
  (service, both evaluator routes, admin route, test). Remaining repo tsc errors are in
  untouched files (`authentication/index.ts` + test, `score.integration.test.ts`).
- **Lint**: `biome check` clean on bolt-011 files (1 warning on `Bun.env.DATABASE_URL!`,
  matching the existing `score.integration.test.ts` convention).

Tests derived from story ACs only (DDD Stage-5 rule), not from implementation code.

### Acceptance Criteria Validation

**Story 001 — reviewer-context seam**

- ✅ **resolveEvaluator(seeded evaluator) → `{accountId, level, region}`** — context built from `getEvaluatorData`.
- ✅ **resolveEvaluator(non-evaluator) → 404 invalid evaluator** — wraps the existing 404.
- ✅ **region non-null + correct region → assertCoverInRegion passes (unchanged)** — evaluator path behaviour-preserving.
- ✅ **region non-null + wrong region → 404** — region gate still enforced for evaluators.
- ✅ **region null + non-existent cover → 404 "cover not found"** — `assertCoverExists` path.
- ✅ **evaluator category filter behaviour-preserving (Mental sees only Mental)** — `categoriesFor(level)` unchanged.
- ➖ **methods accept a ReviewerContext rather than resolving internally** — structural; verified by compilation (`getAnswers`/`verdict` signatures) + all behavioural tests above.
- ➖ **logs use `context.accountId`** — exercised by the verdict/finalize path in **bolt 012**; this bolt only reads. The `accountId` sourcing was refactored and typechecks; asserted end-to-end in 012.

**Story 002 — admin answers endpoint**

- ✅ **admin (region null) reaches a cover in any region and sees all 5 categories** — national ODPC ownership.
- ✅ **admin answer list conforms to `AnswerViewSchema`** — `Value.Check` passes (schema reused).
- ✅ **admin + non-existent cover → 404**.
- ✅ **admin context = `{accountId, level:"ODPC", region:null}`** — `adminReviewerContext` unit test.
- ⚠️ **FLAGGED — non-DOED → 403 / anonymous → 401 at `/admin/covers/*`**: enforced by the
  **shared `adminGuard` (`requireRoles(Role.DOED)`)**, the same middleware already guarding
  other admin routes. Its HTTP short-circuit depends on the elysia-autoload scope-composition
  pipeline and **could not be reproduced in an isolated unit mount** (route 404s without the
  full autoload config; `requireRoles`' `as:"local"` early-return does not propagate in a
  bare `.use().get()` mount). The admin route wires `adminGuard` identically to how the
  evaluator routes wire `evalGuard`. **Recommend an e2e/manual verification of the 403/401
  paths.** Per the DDD bolt rule, this hard-to-test AC is flagged rather than asserted with a
  misleading harness.

### Issues Found

- The 403/401 guard path is not coverable by an isolated service/route unit test (autoload
  coupling). Surfaced as a flag, not a silent omission.
- Pre-existing `score.integration.test.ts` NaN failure observed but out of scope for this bolt.

### Recommendations

- Add an e2e smoke (full app, real cookie) asserting `/admin/covers/:id/answers` returns 403
  for an Evaluator token and 401 anonymous — closes the flagged guard AC.
- Bolt 012 will assert the `accountId` audit (`evaluation_id`/`evaluator_id`) end-to-end via
  the admin verdict commit.
