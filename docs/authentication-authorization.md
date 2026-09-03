# Authentication and authorization

Audit date: 2026-07-15

This document describes the behavior visible in the current repository. Labels mean:

- **Verified**: directly supported by source, configuration, or focused local tests.
- **Inferred**: strongly implied by the implementation, but not exercised against the deployed system.
- **Unknown**: requires deployment or organizational knowledge.

All paths below are relative to the application prefix `/twhp/api` configured in `src/index.ts`.

## Authentication model

The API uses two HTTP-only cookies rather than an `Authorization: Bearer` header (**Verified**):

| Cookie | Purpose | JWT secret | Payload | Lifetime |
| --- | --- | --- | --- | --- |
| `Authentication` | Access token | `AUTH_JWT_SECRET` | `sub`, `iat`, `exp`, `username`, `role` | `AUTH_TOKEN_EXP` seconds |
| `Refresh` | Refresh token | `REFRESH_JWT_SECRET` | `sub`, `iat`, `exp`, `username` | `REFRESH_TOKEN_EXP` seconds |

`authenticationService.helper.issueToken` in `src/service/authentication.ts` signs both tokens with HS256. `helper.getCookieOption` sets `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure=COOKIE_SECURE`, and `Max-Age` equal to the corresponding token lifetime. Logout writes both cookies with the same scope and `Max-Age=0`.

The database stores only `SHA-256(refreshToken)` in `Accounts.hashedRefreshToken`, not the refresh token itself (`src/service/authentication.ts`, `helper.setRefreshToken`; `src/drizzle/schema.ts`, `accounts`). There is one hash per account. A later login or refresh rotation replaces it, so only the newest refresh token remains usable. Existing access tokens from older sessions remain usable until their signed expiry because there is no access-token denylist (**Verified**).

### Password storage and policy

Passwords are hashed with bcrypt cost 12 on factory registration and updates, admin updates, first-password changes, password resets, and seed import (`src/service/factory.ts`, `src/service/admin.ts`, `src/service/authentication.ts`, `src/drizzle/seed.ts`). Login uses `bcrypt.compare`.

Password strength is inconsistent (**Verified**):

- `UpdateAdminSchema` applies a 12-character requirement through the admin schema.
- Factory registration/update, reset-password, and evaluator/provincial first-password routes use unconstrained `t.String()`. Empty strings are therefore accepted as passwords; this is a verified defect, not merely a weak minimum.
- Login username and password have no length bounds.
- Changing a password does not clear `Accounts.hashedRefreshToken`; an already-issued refresh session therefore survives a password reset/change unless separately logged out or replaced (**Verified behavior; whether this is acceptable policy is Unknown**).

## Login, OTP, refresh, and logout

### Direct login

1. `POST /authentication/login` validates that `username` and `password` are strings (`src/routes/authentication/index.ts`, `publicAuthenticationController`).
2. `authenticationService.getAutheticatedAccount` loads the account by unique username and calls `bcrypt.compare`. Unknown users and wrong passwords both return 401 `invalid username or password`.
3. An unvalidated Factory account returns 401 `factory not validate`.
4. `requiresOtp(role, isChangePassword)` chooses the next step:
   - Factory never requires OTP.
   - Evaluator and Provincial skip OTP while `isChangePassword=false`, allowing the first-password/email setup flow.
   - Evaluator and Provincial require OTP after that flag becomes true.
   - DOED is mapped to `isChangePassword=true`, so it requires OTP.
5. If OTP is not required, the route issues both tokens, stores the refresh hash, sets both cookies, and returns the session identity.

`isDevOtpBypass` can force the direct path for staff only when all of the following are true: `DEV_SKIP_OTP=true`, `COOKIE_SECURE=false`, a non-empty `DEV_BYPASS_SECRET` is configured, and the `x-dev-bypass` header matches using `timingSafeEqual`. The credential check occurs before this bypass check, and bypass use is logged with account ID, username, and role. The route advertises this header in OpenAPI (`src/routes/authentication/index.ts`; `src/service/authentication.ts`; `src/service/auth-dev-bypass.test.ts`).

### Email OTP login

1. After a correct password for an OTP-required account, `createChallenge(accountId, email)` checks the account-wide Redis failure counter.
2. It creates a 256-bit random hexadecimal `challengeId` and a zero-padded, cryptographically generated six-digit code.
3. Redis stores `2fa:challenge:{challengeId}` as `{accountId, codeHash, attempts}` and `2fa:active:{accountId}` as the active challenge ID, both for `OTP_CHALLENGE_TTL` (default 300 seconds). Only SHA-256 of the OTP is stored.
4. Redis stores `2fa:resend:{challengeId}` for `OTP_RESEND_THROTTLE` (default 60 seconds), then queues a priority-1 `2fa-otp` email job with three attempts and five-second fixed backoff.
5. Login returns `twoFactorRequired`, the opaque challenge ID, and a masked email. It does not issue authentication cookies.
6. `POST /authentication/login/verify-otp` requires a non-empty challenge ID and exactly six numeric characters. `verifyChallenge` checks the challenge and account-wide failure counter. Each wrong code increments `2fa:fail:{accountId}` (default 15-minute window) and the per-challenge attempt count. Five failures destroy the challenge; ten cumulative failures return 429. A correct code deletes the challenge, active-challenge key, and failure counter, then loads the current account and issues both cookies.
7. `POST /authentication/login/resend-otp` requires the existing challenge ID. It rejects expired challenges, account lockout, and a live resend throttle; otherwise it replaces the code/hash, resets per-challenge attempts, resets the challenge TTL, and queues another OTP email.

The behavior matches ADR `docs/adr/0002-email-otp-2fa-for-staff.md` and focused route/service tests. Actual email delivery is asynchronous: a successful API response means the job was accepted, not delivered (**Verified**).

### Access verification and refresh

`jwtPlugin` in `src/middleware/jwt.ts` runs on every protected route:

1. If `Authentication` exists, `@elysiajs/jwt` verifies its HS256 signature, schema, and expiry. A valid payload becomes `jwtPayload`.
2. If access verification fails and `Refresh` exists, the middleware calls `authenticationService.rotateToken`.
3. The service hashes the presented refresh string and finds the account whose stored hash matches.
4. It loads current account identity/role and issues a new access token.
5. It decodes (but does not verify) the refresh token's `exp`. In the first half of the configured lifetime it keeps the existing refresh cookie. In the latter half it issues a new refresh token, replaces the stored hash, and sets a new cookie.
6. The middleware verifies the newly issued access token and exposes its payload.

Important current behavior: `getUserFromRefreshToken` checks only equality with the stored SHA-256 hash. `rotateToken` uses `decodeJwt`, not signature/claim verification, and never rejects an expired refresh token. Consequently, the exact refresh token currently represented by the database hash can mint fresh sessions after its JWT `exp` and browser cookie `Max-Age` have passed if it is presented directly (**Verified from control flow, high confidence**). This conflicts with ADR 0002's statement that `REFRESH_TOKEN_EXP` governs when OTP recurs. Cookie expiry limits normal browser retention but is not server-side token validation.

### Logout and session revocation

`POST /authentication/logout` is itself protected by `jwtPlugin`. It expires both cookies and clears the caller's single stored refresh hash. It does not revoke already-copied access tokens; those remain valid until access-token expiry. `GET /authentication` returns the current database identity and can also trigger transparent refresh.

Invalid/missing sessions return 401 JSON. An exception during refresh clears both cookies and returns `session expired`; a normal invalid-refresh status is mapped to the same response without clearing cookies (`src/middleware/jwt.ts`).

## Roles and guard composition

Roles are the PostgreSQL enum and TypeScript `Role` enum values `Factory`, `Provincial`, `Evaluator`, and `DOED` (`src/drizzle/schema.ts`; `src/service/authentication.ts`).

`requireRoles` in `src/middleware/rbac.ts` consumes the verified JWT role and returns HTTP 403 with the bare string `forbidden` on denial. `src/middleware/guards.ts` composes:

| Guard | Allowed role |
| --- | --- |
| `adminGuard` | `DOED` |
| `factoryGuard` | `Factory` |
| `evalGuard` | `Evaluator` |
| `officerGuard` | `Provincial` |
| `jwtPlugin` alone | Any authenticated role |

The role is taken from a signed access token until that token expires. Refresh issuance reloads the current database role. Protected OpenAPI operations do not declare a cookie security scheme or the middleware-generated 401/403 responses (**Verified**).

## Route authorization inventory

### Public at the Elysia application layer

- `GET /health`
- OpenAPI UI/assets below `GET /document`
- `GET /location/provinces`
- `GET /location/provinces/:provinceId/districts`
- `GET /location/districts/:districtId/subdistricts`
- `POST /factories/register`
- `POST /authentication/login`
- `POST /authentication/login/verify-otp`
- `POST /authentication/login/resend-otp`
- `POST /authentication/reset-password-request`
- `POST /authentication/reset-password`

No additional unguarded application routes were found in the current `src/routes` tree (**Verified by route-source inventory**). Production/staging Nginx additionally requires `x-api-key` for `/twhp/api/`, and denies `/twhp/api/document`; that proxy gate is external to Elysia and must not replace per-user authorization (`nginx/nginx.conf.template`). Development Nginx has neither restriction (`nginx/nginx.conf`). Whether another ingress exposes or further protects these surfaces is **Unknown**.

### Any authenticated role

- `GET /authentication`
- `POST /authentication/logout`
- `GET /file/presigned-url?fileName=...`

### Factory only

- `PATCH /factories`
- `GET|POST|PATCH /factories/enrolls`
- `GET|POST /factories/assessments/covers`
- `GET /factories/assessments/questions`
- `GET|POST|PATCH /factories/assessments/answers`
- `POST /factories/assessments/answers/negotiate`
- `POST /factories/assessments/submission`
- `GET /factories/assessments/score`

Factory service handlers derive the factory account ID from `jwtPayload.sub`, rather than accepting a caller-selected factory ID (**Verified**).

### Evaluator only

- `PATCH /evaluators/password`
- `GET /evaluators/enrolls` and `GET /evaluators/enrolls/:id`
- `GET /evaluators/factories` and `GET /evaluators/factories/:id`
- `GET /evaluators/score`
- `GET /evaluators/covers/:coverId/answers`
- `POST /evaluators/covers/:coverId/answers/:answerId/verdict`
- `POST /evaluators/covers/:coverId/finalize`

Evaluator list, score, and cover-review operations resolve the caller's evaluator region. Cover review also applies evaluator-level category rules. The two detail routes (`GET /evaluators/enrolls/:id`, `GET /evaluators/factories/:id`) now also resolve and enforce the caller's region: an out-of-region id returns the endpoint's normal not-found response, byte-identical to a non-existent id (fixed 2026-09-03; see `.scratch/evaluator-detail-scope/`). This closed the gap previously tracked in Security findings.

### Provincial only

- `PATCH /provincialOfficers/password`
- `GET /provincialOfficers/enrolls`
- `GET /provincialOfficers/enrolls/:id`
- `GET /provincialOfficers/factories`
- `GET /provincialOfficers/factories/:id`
- `GET /provincialOfficers/score`
- `GET /provincialOfficers/covers/:coverId/answers`

These routes resolve the caller's province before querying (**Verified**). The two detail routes reuse the same province-scoped read as the corresponding Evaluator/DOED reads and return the endpoint's normal not-found response for an out-of-province id, identical to a non-existent one.

The cover-review read reuses `evaluatorReviewService.getAnswers` through a new province-scoped `ReviewerScope` (`{ kind: "province"; province }`), added alongside the pre-existing `region` and `national` scopes. Two rules apply only to this scope:

- **Status gate:** the Cover's latest status must be `in_review` or `finished`; an `in_progress` Cover returns `404 { message: "cover not found" }`, the same response as an out-of-province Cover.
- **Verdict redaction:** while `in_review`, every Answer's latest verdict choice and description are forced `null` and its per-Answer `status` is forced `in_review`, regardless of the underlying evaluator record. Once `finished`, the Officer sees the same values an Evaluator sees. Standard certificates are never redacted. The redaction lives inside `evaluator-review.ts`, keyed on the scope discriminator — Evaluator and DOED reads are unaffected.

The Officer resolves to evaluator level `ODPC` for category-filtering purposes only (all five `QuestionCategory` values are in scope); it carries no write authority and cannot reach verdict-save or finalize routes.

### DOED only

- `PATCH /admins`
- `GET /admins/enrolls` and `GET /admins/enrolls/:id`
- `GET /admins/factories`, `PATCH /admins/factories/validate/:id`, and `GET|PATCH|DELETE /admins/factories/:id`
- `GET /admins/score`
- `GET /admins/covers/:coverId/answers`
- `POST /admins/covers/:coverId/answers/:answerId/verdict`
- `POST /admins/covers/:coverId/finalize`

DOED review deliberately uses `adminReviewerContext`, which carries `scope: { kind: "national" }`, representing national ODPC access (`src/service/evaluator-review.ts`). The reviewer scope is a discriminated union (`national | region | province`) as of 2026-09-03; national and region behavior for DOED and Evaluator callers is unchanged.

## Password reset and first-password flows

`POST /authentication/reset-password-request` is public. It checks `reset_password_token:{email}`, returns 404 for an unknown email, then creates a 256-bit token and stores both token-to-email and email-to-token Redis keys for 300 seconds. It queues a three-attempt password-reset email. The different unknown/known responses permit account-email enumeration (**Verified behavior**).

`POST /authentication/reset-password` accepts an unconstrained string password and token. It rejects an expired/unknown token and reuse of the current password, hashes the new password with bcrypt cost 12, updates the account, and deletes both Redis keys. Redis operations and the database update are not one transaction.

Evaluator and Provincial first-login routes are protected by their normal role guards. `editFirstPassword` ensures the role-specific row exists and `isChangePassword=false`, rejects a duplicate email, then transactionally changes the password/email and flips the role-specific flag. Until this succeeds, those staff accounts can continue to log in without OTP by design.

## Input validation, serialization, and upload controls

Elysia TypeBox schemas validate route bodies, queries, parameters, cookies, and responses. The root `onError` converts validation, parse, and invalid-file-type failures to HTTP 400 and returns selected validation details. Route-only authentication tests observe Elysia's default 422 because they do not mount the root handler (`src/index.ts`; `src/routes/authentication/index.test.ts`).

Response schemas reduce accidental field leakage, but naming and error shapes are inconsistent: authentication uses `full_name`, `change_pw`, and `eval_level`; JWT failures use `{message}`; RBAC uses a bare string. OpenAPI has no cookie security scheme (**Verified**).

Factory upload routes accept only TypeBox `File` values declared as `application/pdf`, maximum 10 MiB per file. Enrollment supports up to eleven certificate files and answer operations up to nine evidence files. Bun and Nginx allow a 130 MiB total body (`src/schema/enroll.ts`; `src/schema/answer.ts`; `src/index.ts`; `nginx/nginx.conf*`). The object key is a server-generated UUID plus the final client filename extension.

The implementation trusts the multipart MIME type and stores the bytes unchanged; it does not inspect PDF magic/content, normalize active PDF content, or scan for malware. MinIO serves the stored object inline with the submitted content type (**Verified controls; exploitability/content policy is Unknown**). UUID naming prevents client-controlled path traversal in uploaded object keys.

## HTTP, browser, proxy, and logging posture

- **CORS — Verified absence / deployment Unknown:** no CORS plugin or explicit `Access-Control-Allow-*` headers are configured in Elysia or repository Nginx. Credentialed cross-origin browser use therefore requires behavior from another ingress or a same-origin deployment.
- **CSRF — Verified controls / residual risk Inferred:** cookies use `SameSite=Lax`, but there is no CSRF token or Origin/Referer enforcement. Lax materially limits cross-site cookie sending, but same-site sibling origins and any endpoints accepting simple form requests require a deployment-specific threat model.
- **Security headers — Verified absence / deployment Unknown:** no CSP, HSTS, `X-Content-Type-Options`, frame, referrer, or permissions policy is set by Elysia/repository Nginx. MinIO responses receive `Cache-Control: no-store` and inline disposition. An outer ingress may add headers.
- **Rate limiting — Verified partial:** OTP attempts, resend, and challenge creation have Redis controls. Password login, factory registration, and general API routes have no application limiter. Password reset throttles only known emails after a token is created.
- **Proxy trust — Verified configuration / deployment Unknown:** repository Nginx appends `X-Forwarded-For`; Elysia logs that header directly and does not use it for authorization/rate limiting. No trusted-proxy list or real-IP chain is configured for the API location. Client-supplied forwarded values can make logs ambiguous unless an upstream strips/normalizes them.
- **Logging — Verified:** request logging records method, URL (therefore query strings, including presigned `fileName`), content type, whether an Authorization header exists, forwarded IP, and user agent. It does not intentionally serialize cookie values or request bodies. Validation/unexpected errors are logged; clients receive a generic unexpected-error body.
- **Secrets — Verified repository posture:** `.env` and `docker.env` are ignored. `src/config.ts` fails startup for missing/malformed application-consumed settings but imposes no entropy/minimum-length requirement on JWT, MinIO, SMTP, database, or bypass secrets. Compose/Nginx-only settings such as `NGINX_API_KEY` are not loaded or validated by `src/config.ts`. `src/test/setup.ts` contains a tracked credential-like database fallback and default MinIO credentials; whether any value is live/reused is Unknown and should be checked without publishing it.

## Security findings and authorization boundaries

### Verified defects

1. **Refresh token expiry/signature is not verified — Critical.** `helper.getUserFromRefreshToken` authorizes solely by the stored SHA-256 hash, and `rotateToken` only calls `decodeJwt`. Exploitation requires possession of the exact token represented by the current database hash; arbitrary forged/tampered strings do not match. That exact token nevertheless remains server-acceptable beyond JWT expiry and can obtain a new access/refresh pair, including for privileged accounts, until the hash is replaced. This defeats the promised server-side session/2FA recurrence boundary. Confidence: high.
2. **File presigning is filename-only — High confidentiality risk.** `src/routes/file/index.ts` permits every authenticated role; `fileService.getPresignedUrl` authorizes only that `fileName` is non-empty; `utilities().getPresignedUrl` signs that key for five seconds. It performs no owner, role, region, province, enrollment, cover, category, or answer check. UUID object names reduce guessing, but authorized API responses disclose names. Confidence: high. Explicitly out of scope for the 2026-09-03 evaluator-detail and provincial read-only work (`.scratch/evaluator-detail-scope/`, `.scratch/provincial-read-only-review/`); tracked separately in [technical debt](technical-debt.md) (TD-02).
3. **Direct-login `full_name` is assembled from incomplete joins — Low functional/security-adjacent defect.** `getAutheticatedAccount` joins name columns only from evaluator/provincial tables and returns string interpolation for every role. Factory and DOED direct login can return null-like names, while `helper.getAccountById` correctly joins factory/admin data. This is identity-display inconsistency, not an authorization bypass. Confidence: high.
4. **Known seed administrator credential in dev/staging workflow — High configuration risk if staging is reachable.** `src/drizzle/seed.ts` creates a fixed DOED account with a hard-coded weak password. Compose runs `db:seed` for both `dev` and `staging` profiles. Staging Nginx also requires an API key, but that is an additional shared gate rather than a replacement for account security. Whether the staging profile is deployed or reachable is Unknown. Confidence: high on repository behavior.

### Verified weaknesses requiring policy decisions

- No password-login limiter; bcrypt runs for every known-account attempt. Severity: medium/high depending edge controls.
- Password reset reveals whether an email exists. Severity: low/medium depending account privacy and targeting risk.
- Password changes/resets do not revoke active refresh sessions. Severity: medium for account-recovery expectations.
- Evaluator/Provincial first login deliberately issues cookies before OTP; `editFirstPassword` does not revoke or rotate that refresh hash, and refresh does not re-prompt for OTP. Combined with missing server-side refresh expiry, a copied pre-OTP-established refresh token can remain usable until its hash is replaced. Required policy and recurrence behavior are Unknown.
- Password strength varies substantially by endpoint. Severity: medium.
- No server-side access-token revocation; logout revokes the refresh hash only. This is common stateless-JWT behavior, but the accepted exposure window must match `AUTH_TOKEN_EXP`.
- The production/staging Nginx template exposes a shared `x-api-key` mechanism. If a browser must send it, it should be treated as an ingress routing gate, not a secret user-auth factor. Client and ingress architecture is Unknown.
- `docker-compose.yaml` uses known default MinIO root credentials and publishes PostgreSQL/Redis host ports for profiles that include production. The API/MinIO containers themselves have no direct published API ports, and actual host firewall/outer ingress is Unknown. Treat these as deployment hardening items, not proof of Internet exposure.

### Inferred risks

- A Redis read compromise permits cheap offline brute force of six-digit OTP SHA-256 hashes. Attempt counters protect the API path but not stolen Redis contents.
- Concurrent OTP challenge creation is not atomic; more than one challenge key may briefly remain valid even though `2fa:active:{accountId}` stores only one ID. Verification does not require the supplied ID to equal the active ID.
- Same-site hostile sibling origins may be able to trigger cookie-authenticated mutations because no explicit CSRF token/origin check exists. Applicability depends on domain layout and accepted content types.
- Inline PDFs are client-originated active documents. MIME/size validation alone may not satisfy malware/content-safety requirements.

### Unknown / requires organizational knowledge

- Required maximum access and refresh session lifetimes, and whether refresh sessions should be absolute or sliding.
- Whether all frontends are same-origin/same-site with the API, and what outer proxy adds CORS/security headers/TLS.
- Which roles may retrieve each class of certificate/evidence file — evaluator region and Provincial Officer province are now confirmed authorization boundaries for enrollment/factory detail (2026-09-03), but presigned file access remains filename-only for every role.
- Whether password reset/change must terminate all sessions and whether concurrent devices are supported.
- Whether repository fallback/seed credentials are deployed or reused anywhere.
- Production secret storage, rotation, entropy, audit process, firewall rules, Redis authentication/TLS, PostgreSQL exposure, MinIO policy, and backup encryption.

## Coordinator decisions

1. Fix refresh verification first: verify the refresh JWT with `REFRESH_JWT_SECRET`, HS256, expected claims, and expiry before database-hash lookup/rotation; add expired/tampered/malformed tests. Decide absolute versus sliding lifetime.
2. ~~Confirm and enforce evaluator detail scope, preferably returning 404 for out-of-region IDs to avoid resource enumeration.~~ Done 2026-09-03 — both Evaluator detail routes now enforce region scope, and the new Provincial Officer detail/cover-review routes enforce province scope, all returning the endpoint's normal not-found response for an out-of-scope id.
3. Replace arbitrary filename presigning with resource-scoped authorization or prove the filename belongs to a caller-authorized row before signing.
4. Define one password policy and apply it to registration, reset, first change, and account edits. Decide whether password changes clear refresh hashes.
5. Add account/IP-aware login and reset controls at an explicitly trusted network layer; normalize trusted client IP first.
6. Decide CORS/CSRF and security-header policy from actual frontend/ingress topology.
7. Remove or rotate fixed staging/admin credentials; prevent production-like seed execution; audit tracked fallback credentials for reuse.
8. Decide whether production OpenAPI should document the development bypass and whether `/document` denial belongs in the app as well as Nginx.
9. Standardize 401/403/error schemas and add cookie security requirements to OpenAPI.
10. Define upload content-safety requirements and MinIO authorization/audit expectations.
