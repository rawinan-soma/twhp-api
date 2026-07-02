---
bolt: 017-dev-otp-bypass
created: 2026-06-23T04:27:07Z
status: accepted
superseded_by:
---

# ADR-4: Reuse `COOKIE_SECURE` as the Production Signal for the Dev OTP Bypass

## Context

The developer OTP bypass ([[006-dev-otp-bypass]]) must be **structurally impossible in
production** (FR-3): even if `DEV_SKIP_OTP=true` and the correct `X-Dev-Bypass` secret are
present, a production deployment must still enforce email-OTP for staff. This requires a reliable
"are we in production?" signal inside `isDevOtpBypass`.

The codebase has **no existing environment discriminator** — there is no `NODE_ENV`, no
`APP_ENV`. The closest existing, already-required boolean is `COOKIE_SECURE` (validated in
`src/config.ts`), which is `true` in real HTTPS deployments and `false` for local/dev. All env
access is centralized in `config.ts` (coding-standards: never read `Bun.env` directly elsewhere).

Forces at play:
- The bypass weakens auth, so its production guard is **security-critical** — a wrong signal
  re-opens staff login to a single-factor path.
- The project constraints favor **no new config surface** unless justified, and this is a
  dev-experience feature, not a deployment-model change.
- A future, more explicit signal (`APP_ENV`) may be desirable as the app grows.

## Decision

Use **`COOKIE_SECURE === true`** as the production signal that hard-disables the dev OTP bypass.
`isDevOtpBypass` returns `false` whenever `env.COOKIE_SECURE` is `true`, regardless of
`DEV_SKIP_OTP`, `DEV_BYPASS_SECRET`, or the request header. At startup, if `DEV_SKIP_OTP=true`
while `COOKIE_SECURE=true`, log a one-time warning that the bypass is configured-but-ignored.

## Rationale

`COOKIE_SECURE` already encodes the dev-vs-prod boundary the bypass cares about: a deployment
serving secure cookies is, by definition, a real HTTPS environment where single-factor staff
login is unacceptable. Reusing it adds **zero new config**, keeps all env logic in `config.ts`,
and is impossible to forget to set (it is already `requireEnvBoolean` — mandatory at boot).

Introducing `APP_ENV` now would add a second source of truth for "is production" that could
**drift** from `COOKIE_SECURE` (e.g. `APP_ENV=development` but `COOKIE_SECURE=true`), creating an
ambiguous and more dangerous state. Deferring `APP_ENV` keeps a single, already-enforced boundary.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
| ----------- | ---- | ---- | ------------ |
| Dedicated `APP_ENV=production` var | Explicit, self-documenting; decoupled from cookie transport | New required env var; second "is-prod" source that can drift from `COOKIE_SECURE`; more to configure/forget | Adds config + drift risk for no security gain in v1 |
| Introduce `NODE_ENV` convention | Familiar Node idiom | Not used anywhere in this Bun codebase; would be a new convention; same drift risk | Foreign to the stack; no existing usage to lean on |
| No production guard (flag-only) | Simplest | A leaked secret + a misset flag bypasses prod OTP — defeats FR-3 | Unacceptable security trade-off (rejected at inception Checkpoint 1) |
| Block when `DEV_BYPASS_SECRET` unset only | No env coupling | Does not distinguish prod from dev; a prod deploy could still set both | Does not satisfy "impossible in production" |

## Consequences

### Positive

- Production hard-block with **no new configuration** and a single, already-mandatory boundary.
- All environment logic stays in `config.ts`; the policy helper reads one boolean.
- Impossible-to-skip guard: `COOKIE_SECURE` is required at boot, so the signal always exists.

### Negative

- **Semantic indirection**: the production guard is coupled to a cookie-transport flag rather
  than an explicit environment name. A maintainer must know this coupling exists (documented
  here, in the design doc, and in the helper's guard order).

### Risks

- **Misconfigured "prod" with `COOKIE_SECURE=false`**: a real deployment that (wrongly) serves
  insecure cookies would also be treated as non-production and could honor the bypass *if*
  `DEV_SKIP_OTP=true` and the secret leaked. Mitigations: (a) `DEV_SKIP_OTP` defaults to `false`
  and the secret defaults empty (fail-closed) — both must be deliberately set; (b) serving
  insecure cookies in production is already a misconfiguration the team avoids; (c) the
  bypass-usage `warn` log makes any real-environment activation visible.
- **Future divergence**: if a non-HTTPS production tier ever appears, revisit this ADR and
  migrate to an explicit `APP_ENV`. The helper is the single change point.

## Related

- **Stories**: 001-bypass-config, 002-bypass-decision-helper
- **Standards**: candidate for `standards/` if an explicit `APP_ENV` is later adopted
- **Previous ADRs**: ADR-2 (SMTP login-critical) — this bypass is the dev-time mitigation for
  that dependency, while remaining disabled in production
