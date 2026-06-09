---
id: 004-email-masking
unit: 001-staff-2fa
intent: 002-staff-2fa
status: draft
priority: must
created: 2026-06-09T00:00:00Z
assigned_bolt: 003-staff-2fa
implemented: false
---

# Story: 004-email-masking

## User Story

**As a** staff user mid-login
**I want** to see a masked hint of where my code was sent
**So that** I know which inbox to check without the full address being disclosed

## Acceptance Criteria

- [ ] **Given** `rawinan.soma@gmail.com`, **When** masked, **Then** returns `r****@gmail.com` (first local char + fixed mask + full domain)
- [ ] **Given** a single-character local part `a@x.com`, **When** masked, **Then** returns a non-revealing form (e.g. `*@x.com`)
- [ ] **Given** any email, **When** masked, **Then** the full local part is never present in the output
- [ ] **Given** the step-1 `/login` staff response, **When** returned, **Then** the `email` field contains only the masked value

## Technical Notes

- Small pure helper — colocate in `src/service/authentication.ts` (or `src/utils.ts` if reused elsewhere)
- Mask rule: keep first character of local part, replace the rest with a fixed `****`, keep `@domain` intact
- Pure function, trivially unit-testable

## Dependencies

### Requires

- None (pure helper)

### Enables

- 006-login-two-step (uses it in the step-1 response)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Empty/invalid email | Should not happen (email is notNull); return a safe masked placeholder, never throw |
| Local part length 1 | Mask fully (`*@domain`) |
| Plus-addressing `a+tag@x.com` | Mask after first char like any other local part |

## Out of Scope

- Validating email format (already enforced at account creation)
