---
id: 009-auth-response-schemas
unit: 001-staff-2fa
intent: 002-staff-2fa
status: draft
priority: must
created: 2026-06-09T00:00:00Z
assigned_bolt: 004-staff-2fa
implemented: false
---

# Story: 009-auth-response-schemas

## User Story

**As a** frontend consumer of the auth API
**I want** typed, documented request/response shapes for the two-step login
**So that** I can branch on `twoFactorRequired` and the OpenAPI docs stay accurate

## Acceptance Criteria

- [ ] **Given** the modified `/login`, **When** documented, **Then** the `200` response is a `t.Union` of the existing `{ message, user }` shape and the new `{ twoFactorRequired: true, challengeId, email }` shape
- [ ] **Given** `POST /login/verify-otp`, **When** documented, **Then** body is `{ challengeId: string, code: string }` and responses cover `200 { message, user }`, `400`, `401`, `429`
- [ ] **Given** `POST /login/resend-otp`, **When** documented, **Then** body is `{ challengeId: string }` and responses cover `200`, `400`, `429`
- [ ] **Given** all DTOs, **When** added, **Then** they live in `src/schema/authentication.ts` and are composed/reused (not redeclared inline) following the existing schema pattern
- [ ] **Given** the OpenAPI document at `/twhp/api/document`, **When** regenerated, **Then** the new shapes appear with descriptions

## Technical Notes

- Extend `src/schema/authentication.ts` with `TwoFactorRequiredResponse`, `VerifyOtpBody`, `ResendOtpBody`, and reuse the existing login-success object
- `code` validated as a 6-char string (optionally `pattern: "^[0-9]{6}$"`); keep messages consistent with existing auth error DTOs
- Use `t.Union` for the polymorphic `/login` 200 so the discriminator `twoFactorRequired` is visible in docs

## Dependencies

### Requires

- None (schema definitions)

### Enables

- 006-login-two-step
- 007-verify-otp-endpoint
- 008-resend-otp-endpoint

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Client ignores `twoFactorRequired` | No cookies present → guarded routes 401, forcing correct flow |
| Extra fields in body | TypeBox strips/validates per existing config |

## Out of Scope

- Frontend implementation of the two-step UI
