# Global Story Index

## Overview

- **Total stories**: 17
- **Completed**: 8
- **Planned**: 9
- **Last updated**: 2026-06-09

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

---

## Stories by Status

- **Planned**: 9
- **Generated**: 0
- **In Progress**: 0
- **Completed**: 8
