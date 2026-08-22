# Global Story Index

## Overview

- **Total stories**: 76
- **Completed**: 33
- **Planned**: 38
- **Generated**: 5
- **Last updated**: 2026-08-20

---

## Stories by Intent

### 001-score-calculator-and-report

Unit: `001-score-service`

- [x] **001-score-formula** ✅ COMPLETE — Score calculation formula — Must
- [x] **002-category-breakdown** ✅ COMPLETE — Per-category score breakdown — Must
- [x] **003-cover-status-guard** ✅ COMPLETE — Reject in_progress covers — Must
- [x] **004-factory-endpoint** ✅ COMPLETE — Factory score endpoint — Must
- [x] **005-evaluator-endpoint** ✅ COMPLETE — Evaluator score list endpoint — Must
- [x] **006-provincial-endpoint** ✅ COMPLETE — Provincial officer score list endpoint — Must
- [x] **007-admin-endpoint** ✅ COMPLETE — Admin score list endpoint with filters — Must
- [x] **008-score-report-shape** ✅ COMPLETE — Score report TypeBox schema — Must
- [ ] **009-scoring-breakdown-fields** ⏳ PLANNED — Nested `scoring`: count/max/achieved/percentage per group (breaking) — Must — bolt `005-score-service`

### 002-staff-2fa

Unit: `001-staff-2fa`

- [ ] **001-otp-challenge-lifecycle** ⏳ PLANNED — Redis challenge create/verify/expire — Must — bolt `003-staff-2fa`
- [ ] **002-otp-generation-policy** ⏳ PLANNED — 6-digit CSPRNG code, hashed, single-use — Must — bolt `003-staff-2fa`
- [ ] **003-attempt-lockout** ⏳ PLANNED — Per-challenge cap + cumulative lockout + resend throttle — Must — bolt `003-staff-2fa`
- [ ] **004-email-masking** ⏳ PLANNED — Mask email for step-1 response — Must — bolt `003-staff-2fa`
- [ ] **005-otp-email-job** ⏳ PLANNED — `2fa-otp` queue job + worker + template — Must — bolt `003-staff-2fa`
- [ ] **006-login-two-step** ⏳ PLANNED — Modify /login: polymorphic + exemptions — Must — bolt `004-staff-2fa`
- [ ] **007-verify-otp-endpoint** ⏳ PLANNED — `POST /login/verify-otp` — Must — bolt `004-staff-2fa`
- [ ] **008-resend-otp-endpoint** ⏳ PLANNED — `POST /login/resend-otp` — Should — bolt `004-staff-2fa`
- [ ] **009-auth-response-schemas** ⏳ PLANNED — TypeBox DTOs for new/modified responses — Must — bolt `004-staff-2fa`

### 003-evaluator-review

Unit: `001-evaluator-review`

- [ ] **001-schema-changes** ⏳ PLANNED — `verdict_choice` col + `recommended` status + `grade` field — Must — bolt `006-evaluator-review`
- [ ] **002-level-category-access** ⏳ PLANNED — level→category map + region scoping — Must — bolt `006-evaluator-review`
- [ ] **003-answers-list-endpoint** ⏳ PLANNED — GET answers, hard category filter — Must — bolt `007-evaluator-review`
- [ ] **004-verdict-batch-endpoint** ⏳ PLANNED — POST verdict, atomic batch + `403` guard + 3 outcomes — Must — bolt `007-evaluator-review`
- [ ] **005-finalize-and-transition** ⏳ PLANNED — ODPC override/backstop/finalize + cover transition — Must — bolt `008-evaluator-review`
- [ ] **006-file-deletion-on-reject** ⏳ PLANNED — MinIO delete at ODPC commit, outside txn — Must — bolt `008-evaluator-review`
- [ ] **007-factory-accept-object-redo** ⏳ PLANNED — Factory negotiation actions + file validator — Must — bolt `009-evaluator-review`
- [ ] **008-resubmit-gate** ⏳ PLANNED — Re-submit when no answer rejected — Must — bolt `009-evaluator-review`
- [ ] **009-grade-and-live-choice** ⏳ PLANNED — Live-choice scoring + 4-tier grade + Score Report field — Must — bolt `010-evaluator-review`
- [ ] **010-verdict-email** ⏳ PLANNED — Verdict-result email on every ODPC commit — Must — bolt `010-evaluator-review`

### 004-admin-as-evaluator

Unit: `001-admin-as-evaluator` — depends on `003-evaluator-review` (do not construct before it)

- [x] **001-reviewer-context-seam** ✅ COMPLETE — Generalize reviewer context `{accountId, level, region|null}` + region-less cover check — Must — bolt `011-admin-as-evaluator`
- [x] **002-admin-answers-endpoint** ✅ COMPLETE — `GET /admin/covers/:coverId/answers`, national ODPC, all categories — Must — bolt `011-admin-as-evaluator`
- [x] **003-admin-verdict-endpoint** ✅ COMPLETE — `POST /admin/covers/:coverId/verdict` → ODPC finalize + admin audit + Grade/email parity — Must — bolt `012-admin-as-evaluator`

### 006-dev-otp-bypass

Unit: `001-dev-otp-bypass`

- [x] **001-bypass-config** ✅ COMPLETE — `DEV_SKIP_OTP` + `DEV_BYPASS_SECRET` env vars + startup production warning — Must — bolt `017-dev-otp-bypass`
- [x] **002-bypass-decision-helper** ✅ COMPLETE — `isDevOtpBypass(headerValue)` fail-closed gate + constant-time compare + prod hard-block — Must — bolt `017-dev-otp-bypass`
- [x] **003-login-route-wiring** ✅ COMPLETE — Read `X-Dev-Bypass`, OR into `/login` non-OTP branch, log usage, doc header — Must — bolt `017-dev-otp-bypass`

### 007-cover-status-filter

Unit: `001-enroll-cover-filter`

- [x] **001-cover-status-derivation-and-filter** ✅ COMPLETE — Service enrichment (latest-log-wins coverId/coverStatus) + `coverStatus` filter incl. `none`, AND-combined with scope — Must — bolt `018-enroll-cover-filter`
- [x] **002-enroll-cover-response-schema** ✅ COMPLETE — Shared enroll response schema adding `coverId`/`coverStatus` nullable — Must — bolt `018-enroll-cover-filter`
- [x] **003-enroll-routes-coverstatus-param** ✅ COMPLETE — `coverStatus` query param on admins/evaluators/provincialOfficers enroll routes; 400 on invalid; behaviour-preserving — Must — bolt `018-enroll-cover-filter`

### 008-per-answer-verdict-save

Unit: `001-per-answer-verdict-save`

- [x] **001-verdict-schema-refactor** ✅ COMPLETE — `VerdictSaveBodySchema` (no answerId) + `FinalizeSchema`; batch schema retained (removal deferred to bolt 021) — Must — bolt `019-per-answer-verdict-save`
- [x] **002-save-answer-verdict-service** ✅ COMPLETE — `saveAnswerVerdict`: one `answerLogs` row, approve→`recommended` for all levels, no MinIO/coverLogs/email — Must — bolt `019-per-answer-verdict-save`
- [x] **003-authorship-edit-guard** ✅ COMPLETE — `eval_id`-keyed guard: `finished`→none, `recommended`→author/ODPC, `rejected`/`in_review`→scoped — Must — bolt `019-per-answer-verdict-save`
- [ ] **004-odpc-finalize-action** ⏳ PLANNED — `finalize` (ODPC only): hard-gate on `in_review`, `recommended`→`finished`, deferred hard-reject delete, transition, grade, email — Must — bolt `020-per-answer-verdict-save`
- [ ] **005-save-and-finalize-routes** ⏳ PLANNED — New `answers/:answerId/verdict` + `finalize` routes (evaluators); remove batch `verdict` route — Must — bolt `021-per-answer-verdict-save`
- [ ] **006-admin-surface-parity** ⏳ PLANNED — Mirror save + finalize under `admins/covers/*` via `adminReviewerContext` (admin-as-national-ODPC) — Must — bolt `021-per-answer-verdict-save`
- [ ] **007-answers-list-and-docs-regression** ⏳ PLANNED — `GET …/answers` unchanged; regen `docs/api/*`; restructure integration tests to save + finalize — Must — bolt `021-per-answer-verdict-save`

### 009-review-standard-files

Unit: `001-review-standard-files` — depends on `008-per-answer-verdict-save` (enriches the cover-review `/answers` read)

- [x] **001-standard-file-dto** ✅ COMPLETE — `StandardFileItem` schema + `{ answers, standards }` response shape — Must — bolt `022-review-standard-files`
- [x] **002-standards-service-enrichment** ✅ COMPLETE — `getAnswers` returns claimed+uploaded standards from the enroll (`STANDARD_ENROLL_COLUMNS`) — Must — bolt `022-review-standard-files`
- [x] **003-both-surface-response** ✅ COMPLETE — evaluator + admin `/answers` responses use the new shape — Must — bolt `022-review-standard-files`
- [x] **004-docs-and-test-regression** ✅ COMPLETE — regen `docs/api/*`; cover-review tests + `getAnswers` regression updated (seeded standard files) — Must — bolt `022-review-standard-files`

### 010-change-score-file-deletion

Unit: `001-change-score-file-deletion` — depends on `008-per-answer-verdict-save` (modifies its `finalize()`); supersedes ADR-0005's file-preservation clause per ADR-0006

- [ ] **001-widen-finalize-file-deletion** ⏳ PLANNED — Drop the `verdictChoice === null` condition so `change_score` deletes files like hard-reject — Must — bolt `023-change-score-file-deletion`
- [ ] **002-regression-coverstatus-and-surface-parity** ⏳ PLANNED — Verify coverStatus/grade/email + evaluator/admin surface parity unaffected — Must — bolt `023-change-score-file-deletion`

### 011-finished-cover-reward-guard

Unit: `001-finished-cover-reward-guard`

- [x] **001-score-report-finished-grade-guard** ✅ GENERATED — Gate Score Report Grade by latest finished CoverLog — Must — bolt `024-finished-cover-reward-guard`
- [x] **002-finalize-finished-grade-publication** ✅ GENERATED — Publish Grade only after a finished finalize transition — Must — bolt `024-finished-cover-reward-guard`
- [x] **003-finished-grade-contract-regression** ✅ GENERATED — Prove reward-surface parity and preserve existing contracts — Must — bolt `024-finished-cover-reward-guard`

### 012-list-pagination

Unit: `001-list-pagination` — depends on `001-score-calculator-and-report`, `007-cover-status-filter`, `011-finished-cover-reward-guard`

- [x] **001-pagination-query-contract** ✅ COMPLETE — Shared `page`/`limit` query schema: 1-indexed, default 20, max 100 — Must — bolt `025-list-pagination`
- [x] **002-pagination-response-envelope** ✅ COMPLETE — Shared `{ items, meta }` envelope + page builder (`total`, `totalPages`) — Must — bolt `025-list-pagination`
- [x] **003-deterministic-list-ordering** ✅ COMPLETE — Total order on every paginated query; score queries currently have no `ORDER BY` — Must — bolt `025-list-pagination`
- [x] **004-factory-list-pagination** ✅ COMPLETE — Paginate the 3 factory list endpoints (no pushdown needed) — Must — bolt `025-list-pagination`
- [x] **005-cover-status-sql-pushdown** ✅ COMPLETE — Move `enrichAndFilterCovers` coverStatus filter from JS into SQL (latest-log-wins) — Must — bolt `026-list-pagination`
- [x] **006-enrollment-list-pagination** ✅ COMPLETE — Paginate the 3 enrollment list endpoints — Must — bolt `026-list-pagination`
- [x] **007-score-status-sql-pushdown** ✅ COMPLETE — Move `buildScoreReports` in_review/finished filter from JS into SQL — Must — bolt `027-list-pagination`
- [x] **008-page-scoped-answer-fanout** ✅ COMPLETE — Read answers for the page's cover IDs only (~123k rows → ~800) — Must — bolt `027-list-pagination`
- [x] **009-score-list-pagination** ✅ COMPLETE — Paginate the 3 score report list endpoints — Must — bolt `027-list-pagination`
- [x] **010-pagination-contract-documentation** ✅ COMPLETE — Correct `docs/api-conventions.md` "no pagination contract" + OpenAPI — Must — bolt `028-list-pagination`
- [x] **011-pagination-regression-coverage** ✅ COMPLETE — Contract regression coverage: route composition, unwrapped 404s, cross-role envelope parity, OpenAPI — Must — bolt `028-list-pagination`

### 013-fiscal-year-addressing

Unit: `001-fiscal-year-reads` — depends on `001-score-calculator-and-report`, `007-cover-status-filter`, `012-list-pagination`

- [ ] **001-fiscal-year-resolver** 📋 PLANNED — Parameterised, single-clock, `Asia/Bangkok`-pinned `getFiscalYear(year?)`; 16 call sites unchanged — Must — bolt `029-fiscal-year-reads`
- [ ] **002-fiscal-year-query-contract** 📋 PLANNED — Shared optional `fiscalYear` query param (CE, `t.Numeric`, `multipleOf: 1`) — Must — bolt `029-fiscal-year-reads`
- [ ] **003-staff-list-fiscal-year-addressing** 📋 PLANNED — `fiscalYear` on the 9 enrollment/factory/score staff lists; scoping and filters unchanged — Must — bolt `030-fiscal-year-reads`
- [ ] **004-factory-self-read-fiscal-year-addressing** 📋 PLANNED — `fiscalYear` on factory enrollment, cover, answers, score self-reads — Must — bolt `030-fiscal-year-reads`
- [ ] **005-fiscal-year-in-responses** 📋 PLANNED — CE `fiscalYear` on fiscal-scoped responses; frontend renders BE (+543) — Should — bolt `030-fiscal-year-reads`
- [ ] **006-fiscal-year-boundary-coverage** 📋 PLANNED — Sep 30/Oct 1 Bangkok boundaries, leap years, TZ independence, omitted-param parity — Must — bolt `031-fiscal-year-reads`

Unit: `002-out-of-year-writes` — depends on `001-fiscal-year-reads`, `008-per-answer-verdict-save`, `011-finished-cover-reward-guard`

- [ ] **001-evaluator-level-guard** 📋 PLANNED — Level-scoped middleware reading `Evaluators.level`; `evalGuard` cannot express ODPC vs Mental/DOH — Must — bolt `032-out-of-year-writes`
- [ ] **002-past-year-write-authority** 📋 PLANNED — Past-year writes for DOED + ODPC; region-scoped, non-expiring, target year from the record — Must — bolt `032-out-of-year-writes`
- [ ] **003-factory-grace-window-policy** 📋 PLANNED — One declared 31-day window (2026-10-01 → 10-31), expressed relative to the rollover boundary — Must — bolt `033-out-of-year-writes`
- [ ] **004-grace-window-cover-completion** 📋 PLANNED — Factory answer save/update + submit during grace; enrollment stays immutable — Must — bolt `033-out-of-year-writes`
- [ ] **005-concurrent-open-year-disambiguation** 📋 PLANNED — Two open years resolve unambiguously; audit every `.limit(1)` self-read — Must — bolt `034-out-of-year-writes`
- [ ] **006-out-of-year-write-audit** 📋 PLANNED — Attribution + distinguishable refusals; expiry mutates nothing, Cover stays `in_progress` — Must — bolt `034-out-of-year-writes`

---

## Stories by Status

- **Planned**: 38
- **Generated**: 5
- **In Progress**: 0
- **Completed**: 33
