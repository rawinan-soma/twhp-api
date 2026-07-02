---
intent: 006-dev-otp-bypass
phase: inception
created: 2026-06-23T00:00:00Z
---

# Units: Developer OTP Bypass for Staff Login

## Project Type: backend-api
Decomposition: domain-driven. A single unit within the existing authentication domain. No frontend unit.

## Units

| Unit | Purpose | FRs | Priority | Bolt Type |
|------|---------|-----|----------|-----------|
| `001-dev-otp-bypass` | Config + guarded bypass-decision helper + `/login` wiring that skips the OTP step for staff when a secret header is present in a non-production environment | FR-1 to FR-7 | Must | ddd-construction-bolt |

## Requirement-to-Unit Mapping

- **FR-1** Header-gated OTP bypass on `/login` → `001-dev-otp-bypass`
- **FR-2** Multi-condition activation gate (fail-closed) → `001-dev-otp-bypass`
- **FR-3** Production hard-block → `001-dev-otp-bypass`
- **FR-4** Credentials still required → `001-dev-otp-bypass`
- **FR-5** Scope: all staff roles, identical output → `001-dev-otp-bypass`
- **FR-6** Configuration & startup validation → `001-dev-otp-bypass`
- **FR-7** Observability of bypass usage → `001-dev-otp-bypass`

## Dependency Graph

    001-dev-otp-bypass (no cross-unit dependencies)

Depends on existing completed work (read/extend only): authentication (`/login`,
`getAutheticatedAccount`, `requiresOtp`, cookie/token helpers) and `src/config.ts`. No schema,
Redis, or queue changes.

## Why one unit

The change is a single cohesive seam in the authentication domain: two env vars, one pure
decision helper, and one branch in `POST /login`. All three pieces share the
`authenticationService` factory and the `env` config object, and none is independently
shippable. Splitting would fragment one small auth concern.
