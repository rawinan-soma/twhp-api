---
unit: 001-dev-otp-bypass
bolt: 017-dev-otp-bypass
stage: model
status: complete
updated: 2026-06-23T04:27:07Z
---

# Static Model - Developer OTP Bypass

## Bounded Context

**Authentication / Login** — specifically the *second-factor gating* sub-context introduced by
[[002-staff-2fa]]. This bolt adds a **policy decision** at the same seam where `requiresOtp`
already lives: given a login attempt that has passed credential verification, decide whether the
email-OTP step may be **skipped** because the request is a trusted developer request in a
non-production environment.

The bypass is a **read-only policy** over configuration + one request header. It owns no
persistent state, mints no tokens, and touches neither Redis (`2fa:*`) nor the email queue.
Token/cookie issuance remains the responsibility of the existing authentication flow.

## Domain Entities

| Entity | Properties | Business Rules |
| ------ | ---------- | -------------- |
| Staff Account (existing) | `id`, `username`, `role` (`DOED`/`Evaluator`/`Provincial`), `isChangePassword` | Already credential-verified before any bypass evaluation. The account whose OTP step may be skipped. Factory is outside this context (already OTP-free). |

> No new persistent entity is introduced. The bypass policy is stateless.

## Value Objects

| Value Object | Properties | Constraints |
| ------------ | ---------- | ----------- |
| **BypassConfig** | `devSkipOtp: boolean`, `bypassSecret: string`, `isProduction: boolean` | Immutable, resolved once at startup from env (`DEV_SKIP_OTP`, `DEV_BYPASS_SECRET`, `COOKIE_SECURE`). `isProduction` is derived from `COOKIE_SECURE === true`. An empty `bypassSecret` is valid and means "bypass impossible" (fail-closed). |
| **BypassCredential** | `presentedSecret: string \| undefined` | The value of the inbound `X-Dev-Bypass` header. Compared to `BypassConfig.bypassSecret` by **constant-time** equality only. `undefined`/empty → never matches. Never logged. |
| **BypassDecision** | `allowed: boolean` | The computed result. `true` only when every gate in the `EvaluateBypass` invariant passes. Pure function of `BypassConfig` + `BypassCredential`. |

## Aggregates

| Aggregate Root | Members | Invariants |
| -------------- | ------- | ---------- |
| **OtpBypassPolicy** | `BypassConfig`, `BypassCredential` → `BypassDecision` | `allowed === true` **iff** `devSkipOtp === true` AND `isProduction === false` AND `bypassSecret` is non-empty AND `constantTimeEqual(presentedSecret, bypassSecret)`. Fail-closed: any missing/false input ⇒ `allowed === false`. Production (`isProduction === true`) forces `allowed === false` regardless of all other inputs. The policy never reads or writes account/session state. |

## Domain Events

| Event | Trigger | Payload |
| ----- | ------- | ------- |
| **OtpBypassed** | A login completes via the bypass (`BypassDecision.allowed === true` on a credential-valid login) | `{ accountId, username, role }` — emitted as a structured log entry (FR-7). **Never** includes the secret or header value. |
| **DevBypassMisconfiguredInProduction** | App startup observes `devSkipOtp === true` while `isProduction === true` | One-time warning log; payload: a static message (no secret). The bypass remains inert. |

## Domain Services

| Service | Operations | Dependencies |
| ------- | ---------- | ------------ |
| **OtpBypassPolicy** (decision) | `isDevOtpBypass(presentedSecret): boolean` — evaluate the aggregate invariant and return `BypassDecision.allowed` | `BypassConfig` (from `env`); constant-time comparator (`node:crypto`). Pure, no I/O. |
| **Authentication login flow** (existing) | Combine `!requiresOtp(...) || isDevOtpBypass(...)` to choose the non-OTP issuance path; emit `OtpBypassed` when the bypass is the reason | `OtpBypassPolicy`, existing token/cookie issuance + `setRefreshToken` |

## Repository Interfaces

| Repository | Entity | Methods |
| ---------- | ------ | ------- |
| _(none)_ | — | No new repository. The policy reads configuration (`env`), not a data store. No DB, Redis, or queue access is added by this bolt. |

## Ubiquitous Language

| Term | Definition |
| ---- | ---------- |
| **Dev OTP Bypass** | A development-only path that lets a credential-verified staff login skip the email-OTP second factor. |
| **Master switch** | `DEV_SKIP_OTP` (boolean env). When `false`/unset, the bypass cannot activate. |
| **Bypass secret** | `DEV_BYPASS_SECRET` (string env). The shared secret a request must echo to activate the bypass. Empty ⇒ fail-closed. |
| **Bypass header** | `X-Dev-Bypass` request header carrying the presented secret on `POST /login`. |
| **Production signal** | `COOKIE_SECURE === true`. When true, the environment is treated as production and the bypass is hard-disabled. |
| **Fail-closed** | The default-deny posture: any missing/false/empty input yields `allowed === false`. |
| **Hard-block** | The production override that forces `allowed === false` irrespective of flag/secret/header. |
| **Constant-time compare** | Secret equality check with no early-exit/length timing leak (`node:crypto` `timingSafeEqual`). |

---

## Story Coverage

- **001-bypass-config** → `BypassConfig` value object + `DevBypassMisconfiguredInProduction` event (startup warning).
- **002-bypass-decision-helper** → `OtpBypassPolicy` aggregate + `isDevOtpBypass` domain service + `BypassDecision`.
- **003-login-route-wiring** → login-flow service consuming the policy + `OtpBypassed` event.

## Notes / Constraints carried into Design

- Stateless policy — no entity persistence, no new repository.
- Reuses the existing `requiresOtp` seam; the decision is an **OR** with `!requiresOtp(...)`.
- Honors **ADR-2** (SMTP login-critical): this bypass is the dev-time mitigation that lets
  engineers log in without the email worker — but is structurally disabled in production.
- Secret is a value object compared only in constant time; it is never part of any event payload.
