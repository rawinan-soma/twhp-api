---
id: 001-bypass-config
unit: 001-dev-otp-bypass
intent: 006-dev-otp-bypass
status: complete
priority: must
created: 2026-06-23T00:00:00.000Z
assigned_bolt: 017-dev-otp-bypass
implemented: true
---

# Story: 001-bypass-config

## User Story

**As a** developer running the API locally
**I want** the OTP bypass controlled by validated env vars that default to "off"
**So that** the feature is invisible and inert until I deliberately enable it, and never silently active in production

## Acceptance Criteria

- [ ] **Given** neither `DEV_SKIP_OTP` nor `DEV_BYPASS_SECRET` is set, **When** the app boots, **Then** it starts normally with the bypass disabled (`DEV_SKIP_OTP` defaults to `false`, `DEV_BYPASS_SECRET` to empty string)
- [ ] **Given** `DEV_SKIP_OTP` is set to a non-boolean value (e.g. `yes`), **When** the app boots, **Then** startup throws with a clear message (consistent with `requireEnvBoolean` semantics)
- [ ] **Given** `DEV_SKIP_OTP=true` **and** `COOKIE_SECURE=true` (production), **When** the app boots, **Then** a single warning is logged that the dev OTP bypass is configured but ignored in production
- [ ] **Given** `DEV_SKIP_OTP=true` **and** `COOKIE_SECURE=false`, **When** the app boots, **Then** no production warning is logged
- [ ] **Given** any configuration, **When** code outside `src/config.ts` needs these values, **Then** it reads them from the exported `env` object (no direct `Bun.env`)

## Technical Notes

- Add to the `env` object in `src/config.ts`, in/after the `2FA OTP` block:
  - `DEV_SKIP_OTP: optionalEnvBoolean("DEV_SKIP_OTP", false)`
  - `DEV_BYPASS_SECRET: optionalEnv("DEV_BYPASS_SECRET", "")`
- Add the two helpers mirroring the existing `optionalEnvNumber`:
  - `optionalEnvBoolean(key, default)` → reuses the `"true"`/`"false"` validation of `requireEnvBoolean`
  - `optionalEnv(key, default)` → returns the string or the default when unset
- The production-warning log can live at the bottom of `config.ts` or at API bootstrap in
  `src/index.ts`; emit it exactly once. Use the project logger, not `console.log`.
- Document the new vars in `docker.env` / env example with safe defaults (commented-out / empty).

## Dependencies

### Requires

- None (config-level groundwork)

### Enables

- 002-bypass-decision-helper (consumes `env.DEV_SKIP_OTP`, `env.DEV_BYPASS_SECRET`, `env.COOKIE_SECURE`)

## Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| `DEV_SKIP_OTP=true`, `DEV_BYPASS_SECRET` empty | Boots; bypass remains impossible (helper fails closed in 002) |
| `DEV_BYPASS_SECRET` set but `DEV_SKIP_OTP` unset | Boots with bypass disabled (master switch off) |
| Both unset (CI/prod default) | Boots clean, no warning, bypass off |

## Out of Scope

- The decision logic that consumes these values (002)
- Reading the request header (003)
