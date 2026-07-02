# Global Story Index

## Overview

- **Total stories**: 34
- **Completed**: 14
- **Planned**: 20
- **Last updated**: 2026-07-02

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

---

## Stories by Status

- **Planned**: 20
- **Generated**: 0
- **In Progress**: 0
- **Completed**: 14
