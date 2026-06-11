---
intent: 002-staff-2fa
phase: inception
created: 2026-06-09T00:00:00Z
---

# Units: Staff Email-OTP Two-Factor Authentication

## Project Type: backend-api
Decomposition: domain-driven. Single unit within the existing authentication domain. No frontend unit.

## Units

| Unit | Purpose | FRs | Priority | Bolt Type |
|------|---------|-----|----------|-----------|
| `001-staff-2fa` | Email-OTP second factor: Redis challenge lifecycle, OTP policy/lockout, email delivery, and the two-step login route layer | FR-1 to FR-10 | Must | ddd-construction-bolt |

## Requirement-to-Unit Mapping

- **FR-1** Mandatory OTP for staff login → `001-staff-2fa`
- **FR-2** First-login exemption → `001-staff-2fa`
- **FR-3** 2FA Challenge (Redis) → `001-staff-2fa`
- **FR-4** OTP generation/storage policy → `001-staff-2fa`
- **FR-5** Verify-OTP endpoint → `001-staff-2fa`
- **FR-6** Resend-OTP endpoint → `001-staff-2fa`
- **FR-7** Attempt limiting & lockout → `001-staff-2fa`
- **FR-8** Polymorphic /login response → `001-staff-2fa`
- **FR-9** OTP email delivery → `001-staff-2fa`
- **FR-10** Login-only enforcement → `001-staff-2fa`

## Dependency Graph

    001-staff-2fa (no cross-unit dependencies)

Depends on existing completed units (read/extend only): authentication (login, jwtPlugin, rotateToken), email queue/worker, Redis connector. No schema changes.

## Why one unit

The 2FA capability is a single cohesive change to the authentication domain: the Redis challenge mechanics, OTP policy, and the route layer are tightly coupled and share the `authenticationService` factory and the existing `email` queue. Splitting into multiple units would fragment one auth concern. Internal sequencing is handled by the two-bolt plan (service-core before route-layer), mirroring intent 001.
