# API conventions and integration behavior

This document describes the current HTTP contract and integration behavior of the TWHP API. It is a conventions guide, not a complete route reference. For endpoint-specific fields, see the [generated API reference](api/API.md) or [OpenAPI snapshot](api/openapi.json); when generated artifacts differ from route/service code, the code is authoritative.

Known defects and contract drift are called out explicitly so clients do not mistake current behavior for the intended long-term design.

## Base path and route discovery

All application routes are mounted below `/twhp/api` by [`src/index.ts`](../src/index.ts). The live OpenAPI UI is available at `/twhp/api/document`.

Routes are auto-registered from `src/routes/` by `elysia-autoload`. Directories become path segments, and `[param]` files or directories become path parameters. For example:

```text
src/routes/evaluators/covers/[coverId]/answers/[answerId]/verdict/index.ts
→ POST /twhp/api/evaluators/covers/{coverId}/answers/{answerId}/verdict
```

Route files use `""` for their exact autoloaded path and normally use a leading slash for child paths. New routes should preserve that convention.

## Public and protected surfaces

Paths in this section omit the common `/twhp/api` prefix.

| Surface | Access |
| --- | --- |
| `GET /health` | Public |
| `GET /document` and OpenAPI assets | Public |
| `GET /location/**` | Public |
| `POST /factories/register` | Public |
| `POST /authentication/login` | Public |
| `POST /authentication/login/verify-otp` | Public |
| `POST /authentication/login/resend-otp` | Public |
| `POST /authentication/reset-password-request` | Public |
| `POST /authentication/reset-password` | Public |
| Other `/factories/**` routes | `Factory` role |
| `/admins/**` | `DOED` role |
| `/evaluators/**` | `Evaluator` role |
| `/provincialOfficers/**` | `Provincial` role |
| `GET /authentication`, `POST /authentication/logout` | Any authenticated role |
| `GET /file/presigned-url` | Any authenticated role; see the authorization defect below |

Role guards are composed in [`src/middleware/guards.ts`](../src/middleware/guards.ts). Protected routes do not use Bearer authentication.

### Cookie authentication

Clients must retain and send two HTTP-only cookies:

- `Authentication`: access JWT
- `Refresh`: refresh JWT

Cookie options are defined by `authenticationService.helper.getCookieOption` in [`src/service/authentication.ts`](../src/service/authentication.ts):

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`
- `Secure` according to `COOKIE_SECURE`
- `Max-Age` from `AUTH_TOKEN_EXP` or `REFRESH_TOKEN_EXP`

When the access token is absent or invalid and a refresh string matches the one stored database hash, [`src/middleware/jwt.ts`](../src/middleware/jwt.ts) silently issues a new access cookie. Current code does **not** cryptographically verify that refresh JWT's signature or expiry before rotation; the exact retained token can mint sessions after `exp`. See [Authentication and authorization](authentication-authorization.md#access-verification-and-refresh). The refresh cookie rotates only after its decoded (unverified) `exp` enters the latter half of its configured lifetime. A newer login or rotation can replace the stored hash and invalidate an older device's refresh string while that device's access token remains valid until expiry.

Browser clients using a separate origin must send credentials explicitly. The repository does not configure CORS, an Origin check, or a CSRF token. Whether every deployed frontend is same-origin or same-site is currently unknown; deployment owners must confirm the CORS/CSRF posture before enabling cross-origin credentialed requests.

### Login and OTP

`POST /authentication/login` returns one of two HTTP 200 shapes:

```json
{
  "message": "login successful",
  "user": { "id": 1, "role": "Factory", "username": "factory01", "full_name": "..." }
}
```

```json
{
  "twoFactorRequired": true,
  "challengeId": "opaque-id",
  "email": "r****@example.com"
}
```

Submit a six-digit OTP to `/authentication/login/verify-otp`. OTP challenges are stored in Redis and default to:

- five-minute challenge TTL;
- five attempts per challenge;
- 60-second resend throttle;
- ten failures per account within a 15-minute failure window.

OTP and password-reset email jobs request three attempts with five-second fixed backoff.

Factory accounts bypass OTP. DOED accounts are mapped to the OTP-required state. Evaluator and Provincial accounts bypass OTP until their first-password flag has been changed, then require OTP.

Development may bypass staff OTP with the `x-dev-bypass` header only when `DEV_SKIP_OTP=true`, `COOKIE_SECURE=false`, and the header matches `DEV_BYPASS_SECRET`. This control is hard-blocked when secure cookies are enabled. See [ADR-0002](adr/0002-email-otp-2fa-for-staff.md) for the staff OTP design.

## Requests and validation

### JSON and multipart bodies

JSON is the default request format. The following file-bearing operations require `multipart/form-data`:

- `POST /factories/enrolls`
- `PATCH /factories/enrolls`
- `POST /factories/assessments/answers`
- `PATCH /factories/assessments/answers`
- `POST /factories/assessments/answers/negotiate`

Each uploaded file must be a PDF no larger than 10 MiB. Enrollment bodies support up to eleven standard-certificate files; answer bodies support up to nine evidence files. The Elysia server and Nginx API location allow a total body size of 130 MiB, but the per-file TypeBox limits still apply.

Multipart numeric fields use `t.Numeric()` and decode numeric strings to numbers. Enrollment standard booleans accept actual booleans or the exact strings `"true"` and `"false"`. Answer choices are strings: `"0"`, `"1"`, `"2"`, `"3"`, or `"n/a"`.

Answer PATCH requests may explicitly remove an existing evidence object with the matching optional
`delete_file_<row>_<slot>=true` multipart field. Omission or `false` keeps the existing object;
supplying a PDF normally replaces it. For a non-standard `special=3` Question, rows not selected by
the effective score are implicitly cleared and an upload for one of those rows is ignored. Explicit
deletion is available only while the Answer's latest status is `in_review`, deletes the exact MinIO
object, and persists `null` in the matching Answer column. Uploading and deleting the same slot
returns 400, as does deleting evidence required by the effective choice. Evaluator rejection remains
separate: files stay on verdict save and all files for rejected Answers are removed when ODPC/admin
finalizes.

### DTO and serialization style

Domain schemas normally compose Drizzle-derived base schemas from [`src/schema/index.ts`](../src/schema/index.ts). Request DTOs generally use camelCase.

Responses do not have one global casing convention:

- enrollment, scoring, and evaluator-review responses mostly use camelCase;
- factory list/detail responses use snake_case;
- authentication mixes styles such as `full_name`, `change_pw`, and `eval_level`.

Clients must follow each endpoint schema and must not apply a global case conversion.

### Parameters, filtering, and ordering

Path identifiers are numeric. Current routes mix `t.Number()` and `t.Numeric()`; clients should send plain decimal path segments.

There is no pagination contract. List routes return complete arrays and do not accept `page`, `limit`, or cursor parameters. There is also no general client-selected sorting.

Current explicit ordering is limited to:

- factory lists: account ID ascending;
- enrollment lists: enrollment date descending;
- provinces: Thai name ascending.

Other list ordering is not guaranteed.

Supported filters include:

- factory lists: required `validated`, optional `enrolled`;
- staff enrollment lists: optional `coverStatus=finished|in_progress|in_review|none`;
- admin score list: optional `region` and `provinceId`.

Current `enrolled=false` behavior does not mean “only unenrolled factories.” It disables the current-fiscal-year enrollment-date filter; evaluator and provincial variants still inner-join enrollment rows. Treat this as current implementation behavior, not a stable semantic contract.

### Validation status

The global error handler maps validation, body parse, and invalid-file-type failures to HTTP 400. Its response is normally:

```json
{
  "message": "...",
  "on": "body",
  "property": "/field",
  "summary": "..."
}
```

The optional fields depend on whether the framework error message can be parsed. Some route-level tests mount routes without the global handler and therefore observe Elysia's default 422; deployed root-app behavior is 400.

Input strength is not uniform. For example, admin password updates require 12 characters, while registration, factory update, password reset, and first-password routes use unconstrained `t.String()` and accept an empty password. Enrollment creation accepts an unformatted optional safety-officer email, while enrollment update validates email format. Consumers should not infer validation rules from a related endpoint.

## Responses and errors

Successful reads normally return an object or array directly, without a `{data, meta}` envelope. Mutations normally return `{ "message": "..." }`; verdict and finalize operations add identifiers or state.

Empty lists normally return `[]`. One important exception is `GET /factories/enrolls`, which returns HTTP 200 with `{ "message": "no enrollment found" }` when no current enrollment exists.

Expected service failures usually use:

```json
{ "message": "human-readable text" }
```

Do not branch on exact message strings. Spelling, capitalization, examples, and actual service text are not fully consistent.

Global errors from [`src/index.ts`](../src/index.ts) are:

| Condition | Status | Body |
| --- | ---: | --- |
| Validation, parse, invalid file | 400 | `{message, on?, property?, summary?}` |
| Unmatched route | 404 | `{"message":"Not found"}` |
| Unexpected exception | 500 | `{"message":"Unexpected error"}` |

Authentication middleware returns 401 JSON with `unauthorized` or `session expired`. Role denial currently returns HTTP 403 with the bare string `forbidden`, while domain-level 403 responses return `{message}`.

### Documented and actual status drift

The following operations are declared as HTTP 201 in their route schemas and generated OpenAPI, but their current handlers return plain objects and therefore respond with HTTP 200:

- `POST /factories/register`
- `POST /factories/enrolls`
- `POST /factories/assessments/covers`
- `POST /authentication/reset-password-request`

This is confirmed current behavior. Declaring a `201` response schema does not set the Elysia response status.

Declared error unions are also incomplete. Current examples include:

- enrollment creation can return `invalid factory id` or `evaluators not found`;
- login challenge creation can return `account has no email address configured`;
- answer save/update/negotiate can return shorter `choice N requires file_N_1` messages;
- admin factory update documents `admin not found` but returns `factory not found`;
- file presigning documents `invalid file url` but returns `invalid file name`.

The route/service code is authoritative until the schemas and generated reference are aligned.

## Important workflows

### Factory enrollment and assessment

1. Register with `POST /factories/register` and wait for DOED validation.
2. Create the current-fiscal-year enrollment with employee counts, standard flags, and a PDF for every claimed standard.
3. Create one assessment cover with `POST /factories/assessments/covers`.
4. Read questions and save one multipart answer per question.
5. Submit the cover. Submission requires an `in_progress` cover, all questions answered, and no rejected answer awaiting negotiation.
6. Read scores only after the cover reaches `in_review` or `finished`.

Fiscal-year scope is October 1 inclusive through the following October 1 exclusive and is computed by `utilities().getFiscalYear()`.

### Evaluator review

Evaluators read `/evaluators/covers/{coverId}/answers`. Answers are category-filtered by evaluator level; all claimed standard files are included for evaluators with cover access.

`POST .../answers/{answerId}/verdict` appends a verdict log with one of:

- `approve`
- `change_score`
- `reject`

Only ODPC, or a DOED admin acting as national ODPC, may finalize a cover. Finalize:

1. rejects the request if any answer remains `in_review`;
2. promotes `recommended` answers to `finished`;
3. deletes and nulls evidence for rejected results;
4. writes a cover-status transition;
5. calculates grade on demand;
6. attempts to enqueue a factory result email.

See [ADR-0003](adr/0003-hierarchical-odpc-gated-cover-review.md), [ADR-0004](adr/0004-verdict-score-consensus-loop.md), [ADR-0005](adr/0005-per-answer-verdict-save.md), and [ADR-0006](adr/0006-delete-files-on-change-score.md).

Finalize is currently non-idempotent. Repeating an already successful request can insert another cover transition and enqueue another email because the service does not gate on the latest cover status or use an idempotency key. Do not retry finalize blindly after an ambiguous client/network failure; verify the latest cover state first.

## File storage and authorization

MinIO stores uploaded files under UUID-based object names. Database columns store the object name, even where a property ends in `Url`.

Resolve an object name with:

```http
GET /twhp/api/file/presigned-url?fileName=<stored-object-name>
```

The response is `{ "url": "..." }`. [`utilities().getPresignedUrl`](../src/utils.ts) currently passes `5` as the MinIO expiry argument, so the signed URL is valid for **five seconds**. The route description that says “5-minute presigned URL” is stale prose. Do not persist or cache the signed URL.

### Confirmed authorization defects

Two confirmed defects affect resource isolation:

1. Evaluator enrollment and factory detail routes fetch arbitrary IDs without applying the evaluator's region. An authenticated evaluator can request known out-of-region IDs through `/evaluators/enrolls/{id}` and `/evaluators/factories/{id}`.
2. `/file/presigned-url` authorizes only that the caller has some valid session. It does not verify ownership, role, region, enrollment, cover, answer, or evaluator category before signing a non-empty filename. UUID filenames reduce guessing but do not provide authorization because legitimate names are exposed by API responses.

Clients must not treat these gaps as permission. Integrations should request only resources already authorized by their business scope. Server-side fixes are required for enforcement.

## External integrations and failure boundaries

### Integration topology

| Integration | Purpose | Important behavior |
| --- | --- | --- |
| PostgreSQL / Drizzle | System of record | Synchronous; domain services commonly use DB transactions |
| Redis | OTP/reset state | Challenges, throttles, failure counters, reset tokens |
| BullMQ queue `email` | Async email handoff | API producers and a separate worker process |
| Nodemailer / SMTP | Email delivery | OTP, reset, result, revision, and reminder messages |
| MinIO | Certificates and evidence | UUID object names; short-lived presigned GET URLs |
| Nginx | Reverse proxy | API and MinIO paths; 130 MiB API request limit |

Database transactions do not include MinIO, Redis, BullMQ, or SMTP:

- uploads occur before DB insert/update, so a later failure can orphan objects;
- replacement updates can delete the old object before the DB update succeeds;
- Answer PATCH explicit deletions use strict removal. A strict failure returns 500 without a DB
  update, but concurrent removals cannot be cancelled: another removal can already have succeeded or
  can remain in flight, leaving its stored filename dangling;
- Answer PATCH uploads also run before its DB transaction. A later upload failure returns 500
  without a DB update, but an earlier explicit deletion can already have left a dangling filename
  and an upload completed concurrently can become an orphan;
- legacy `special=3` implicit clearing and replacement cleanup use best-effort deletion. That helper
  catches and logs deletion failures, then permits the DB update and successful response; an old
  object can therefore remain orphaned;
- finalize strictly deletes rejected files before its DB transaction and aborts on delete failure;
- finalize commits DB state before enqueueing email and deliberately does not roll back if enqueue fails;
- OTP/reset state is written before queueing, so queue failure can leave throttling/challenge state;
- SMTP delivery happens asynchronously and cannot change the original API response.

These are eventual-consistency workflows. An API success that mentions sending email means queued or attempted, not delivered.

### Retry, timeout, and idempotency behavior

- OTP and password-reset jobs request three attempts with five-second fixed backoff.
- Verdict-result jobs and the daily reminder do not configure multiple attempts.
- Verdict enqueue failure after finalize is logged and swallowed; finalize still succeeds.
- The daily reminder uses a fixed BullMQ `jobId`; OTP, reset, and verdict jobs do not.
- Per-answer verdict save is append-only; repeating the same request appends another log.
- MinIO and Nodemailer clients have no explicit application-level timeout configuration.
- `SMTP_STARTTLS` and `SMTP_SECURE` are validated environment variables but are not applied to the Nodemailer transporter.

Service-level “already exists” checks are not backed by database uniqueness for one fiscal-year enrollment per factory, one cover per enrollment, or one answer per cover/question. Concurrent requests can therefore create duplicates.

### Operational checks

If OTP or reset email does not arrive, verify Redis, BullMQ queue `email`, the separately running `bun run worker` process, and SMTP connectivity. Challenge/reset TTL can expire even while email delivery is delayed.

If finalize succeeds without an email, treat the database transition as authoritative and inspect `verdict-result-finished` or `verdict-result-in-progress` jobs. Do not re-run finalize before checking current state.

If Answer PATCH returns `failed to delete answer files; update aborted`, at least one strict deletion
failed, but other concurrent deletions may already have succeeded or may still complete. Other file
upload or database failures can likewise occur after earlier strict deletions or uploads. In
contrast, best-effort implicit/replacement cleanup logs a deletion failure and permits the update to
continue. There is no automatic compensation or reconciliation; an operator must compare the
affected Answer columns with MinIO and repair dangling references or orphaned objects. Operational
reports must not reproduce stored object names or presigned URLs.

If finalize returns `failed to delete rejected answer files; finalize aborted`, the service failed during strict MinIO deletion before its DB transaction. If MinIO deletion succeeded but a later DB operation failed, database filenames may refer to removed objects.

If a signed file URL expires immediately, confirm the caller fetched it within five seconds, clocks are synchronized, and `MINIO_PUBLIC_URL` matches the Nginx `/twhp/files/` rewrite.

## OpenAPI limitations and drift

The live OpenAPI document and generated snapshots are useful for endpoint-specific request and response fields, but they are not a complete security or failure contract:

- no cookie security scheme is defined;
- protected operations do not declare security requirements;
- middleware-generated 401/403 responses are usually absent;
- common validation and unexpected-error responses are usually absent;
- a declared status can differ from the handler's actual status;
- finalize is described as taking no body in code comments, but its empty-object schema makes OpenAPI mark a request body as required while runtime accepts no body;
- the static Markdown reference identifies itself as generated on 2026-07-03, while evaluator-review code changed afterward;
- the static snapshot does not record the source commit and uses API version `0.0.0`.

The public login schema also exposes the existence and conditions of the development `x-dev-bypass` header, though not its secret.

Generated API artifacts should be regenerated after route/schema changes and reviewed against runtime behavior. Until a generation check is automated, use this precedence:

1. current route and service code;
2. this conventions guide for cross-cutting behavior and known drift;
3. generated [API reference](api/API.md) and [OpenAPI snapshot](api/openapi.json).

## Related documentation

- [Generated API reference](api/API.md)
- [OpenAPI snapshot](api/openapi.json)
- [Score calculation ADR](adr/0001-score-calculated-on-demand.md)
- [Staff OTP ADR](adr/0002-email-otp-2fa-for-staff.md)
- [Hierarchical review ADR](adr/0003-hierarchical-odpc-gated-cover-review.md)
- [Verdict consensus ADR](adr/0004-verdict-score-consensus-loop.md)
- [Per-answer verdict ADR](adr/0005-per-answer-verdict-save.md)
- [Evidence deletion ADR](adr/0006-delete-files-on-change-score.md)
