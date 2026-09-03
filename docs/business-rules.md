# Business Rules

This document records current executable behavior. Current code is authoritative when `CONTEXT.md` or an ADR disagrees; contradictions are identified in each affected rule.

Confidence labels: **Verified** is directly present in code/schema/tests; **Inferred** follows from observed behavior but lacks direct runtime confirmation; **Unknown** cannot be established from the repository alone.

Related references: [domain model](domain-model.md), [database](database.md), [authentication and authorization](authentication-authorization.md), [API](api/API.md), and [technical debt](technical-debt.md).

## Identity, eligibility, and ownership

### BR-01 — Factory registration, validation, and login

- **Rule:** Registration atomically creates `Accounts(role=Factory)` and `Factories(isValidate=false)`. Location is derived from a valid subdistrict. Factory password login requires `isValidate=true`.
- **Implementation:** `src/service/factory.ts:register`; `createFactoryHelper.getFactoryLocation`; `src/service/admin.ts:approveFactoryRegister`; `authenticationService.getAutheticatedAccount`; `CreateFactorySchema`.
- **Inputs/conditions:** unique username/email, valid `subdistrictId`, correct password, validated Factory.
- **Result:** new unvalidated Factory; DOED can validate; validated login issues cookies without OTP.
- **Edges/failure:** duplicate pre-check is race-prone, though DB uniqueness remains; invalid location 404, duplicate 400, unvalidated login 401. Validation is checked only at login. Factory deletion removes the subtype row but leaves the Account; an already-issued session is not immediately revoked.
- **Risk of change:** High—onboarding and access compatibility.
- **Confidence:** **Verified.**

### BR-02 — Staff OTP and first-login exception

- **Rule:** DOED, Evaluator, and Provincial logins require six-digit email OTP after a correct password. Evaluator/Provincial accounts with `isChangePassword=false` bypass OTP until first password/email replacement. Factory always bypasses OTP.
- **Implementation:** `authenticationService.requiresOtp`, `createChallenge`, `verifyChallenge`, `resendOtp`, `editFirstPassword`; `src/routes/authentication/index.ts`; `config.ts:OTP_*`.
- **Inputs/conditions:** correct credentials, role/first-login flag, Redis challenge/counters, OTP.
- **Result:** direct cookies or `{twoFactorRequired, challengeId, email}`; successful OTP is single-use and issues cookies.
- **Edges/failure:** default challenge TTL 300s, per-challenge maximum 5 wrong codes, cumulative threshold 10, resend throttle 60s. A new login during throttle reuses the existing challenge without another email. Failure-key TTL begins on the first failure and is not reset at the threshold, so the effective lock is not necessarily 15 minutes after the tenth failure—contrary to the prose description.
- **Failure behavior:** bad credentials/code 401, invalid/expired challenge 400, threshold/throttle 429.
- **Risk of change:** High—security and login behavior.
- **Confidence:** **Verified.** See [authentication and authorization](authentication-authorization.md).

### BR-03 — Development OTP bypass

- **Rule:** Staff OTP may be bypassed only when `DEV_SKIP_OTP=true`, `COOKIE_SECURE=false`, a nonempty secret exists, and `x-dev-bypass` matches it with constant-time comparison.
- **Implementation:** `authenticationService.isDevOtpBypass`; login route; `src/config.ts:81-83`; bypass tests.
- **Inputs/conditions:** environment gates and header secret.
- **Result:** same direct-login response/cookies as a non-OTP login, with a warning log.
- **Edges/failure:** production-style `COOKIE_SECURE=true`, disabled flag, empty secret, absent/mismatched/length-mismatched header all fail closed. This exception is implemented/tested but absent from ADR-0002's main domain narrative.
- **Risk of change:** High if deployed environments rely on it; low for production behavior when correctly gated.
- **Confidence:** **Verified.**

### BR-04 — Refresh sessions and password recovery

- **Rule:** One refresh-token hash is stored per Account. A matching refresh token renews access without another OTP and rotates in the back half of configured lifetime. Password reset uses Redis tokens with 300s TTL and rejects the current password.
- **Implementation:** `authenticationService.getUserFromRefreshToken`, `rotateToken`, `sendPasswordResetEmail`, `updatePassword`; `src/middleware/jwt.ts`.
- **Inputs/conditions:** stored hash match or valid reset token; distinct new password.
- **Result:** new access token, optionally new refresh token; successful reset clears Redis keys.
- **Edges/failure:** refresh processing matches the stored hash and decodes expiry only for rotation timing; it does not verify refresh signature/expiry before issuing access. Browser cookie expiry limits normal use, but replay of an expired token whose hash is still stored is possible.
- **Failure behavior:** bad refresh 401; missing reset email 404; invalid reset/same password 400; duplicate reset request 429.
- **Risk of change:** High—session semantics.
- **Confidence:** Behavior **Verified**; replay consequence **Inferred**.

### BR-05 — Role and geographic ownership

- **Rule:** Factory reads its own current-fiscal data; Provincial reads one province, including cover-review, enrollment, and factory detail; Evaluator lists/scores one region and reviews by region/category, including enrollment and factory detail; DOED reads/reviews nationally.
- **Implementation:** route guards; Provincial/Evaluator subtype services; `scoreService`; `evaluator-review.ts:assertCoverAccess` (dispatches on the `ReviewerScope` discriminator — `national | region | province`); `categoriesFor`; `enrollService.getEnrollById(id, provinceId?, region?)`; `factoryService.getFactoryById(id, provinceId?, region?)`.
- **Inputs/conditions:** JWT role/sub, subtype scope, current Factory location, evaluator level.
- **Result:** scoped data and reviewer actions.
- **Edges/failure:** as of 2026-09-03, Evaluator enrollment/factory detail reads enforce the caller's health region and Provincial Officer enrollment/factory/cover-review reads enforce the caller's province; an out-of-scope id returns the same not-found response as a non-existent id in every case (`.scratch/evaluator-detail-scope/`, `.scratch/provincial-read-only-review/`). Review does not require matching Enrollment evaluator IDs. `/file/presigned-url` permits any authenticated caller with a known filename — deliberately unchanged by both of the above; see [technical debt](technical-debt.md) (TD-02). Moving a Factory can change the evaluator region for an existing Cover.
- **Failure behavior:** guarded wrong-region/wrong-province review and detail reads return 404; the presign path has no ownership rejection.
- **Risk of change:** High—authorization contracts.
- **Confidence:** Intended list/review/detail scopes and the remaining presign gap are **Verified**.

## Fiscal year, Enrollment, and Cover

### BR-06 — Fiscal-year membership

- **Rule:** Current fiscal year is the half-open range `[Oct 1 00:00, next Oct 1 00:00)`, calculated from application host-local dates and compared in SQL using ISO UTC strings.
- **Implementation:** `src/utils.ts:getFiscalYear`; all `gte/lt(enrolls.enrollDate)` callers.
- **Inputs/conditions:** host clock/timezone and timezone-less `Enrolls.enroll_date`.
- **Result:** current Enrollment/Cover/Answer/Score selection.
- **Edges/failure:** API containers set Asia/Bangkok, PostgreSQL does not explicitly do so, and columns are `timestamp without time zone`. Live boundary interpretation is therefore **Unknown**. Two separate `new Date()` calls add a small rollover race.
- **Failure behavior:** no explicit error; a boundary record may be silently included/excluded.
- **Risk of change:** Very high—annual identity and historical selection.
- **Confidence:** Algorithm **Verified**; database-boundary behavior **Unknown**. See [database](database.md).

### BR-07 — One Enrollment per Factory per fiscal year

- **Rule:** Enrollment creation pre-checks for an existing row for that Factory in the current fiscal interval.
- **Implementation:** `enrollService.create` at `src/service/enroll.ts:181-245`; `Enrolls` schema.
- **Inputs/conditions:** authenticated Factory and no matching row.
- **Result:** creation proceeds; detected duplicate returns 400.
- **Edges/failure:** no database uniqueness or fiscal-year key. Concurrent/direct writes can duplicate; owner lookups use nondeterministic `.limit(1)`.
- **Risk of change:** Very high—constraint introduction requires timezone policy and duplicate cleanup.
- **Confidence:** Application rule **Verified**; durable cardinality absent.

### BR-08 — Enrollment fields and standard certificates

- **Rule:** Enrollment requires 20 workforce counts, 11 standard flags, and safety-officer identity. A true standard requires a PDF certificate. Update retains/replaces certificates and deletes one when its flag becomes false.
- **Implementation:** `CreateEnrollWithFilesSchema`, `UpdateEnrollWithFilesSchema`; `enrollService.create/updateEnroll`.
- **Inputs/conditions:** multipart PDFs up to 10 MB, standard flag/file pairs, current-fiscal Enrollment.
- **Result:** MinIO filenames stored with workforce/contact data.
- **Edges/failure:** counts may be negative; create email is not format-validated. Create permits a false standard with a supplied file and persists it. File I/O precedes DB writes without compensation. Enrollment can be changed after submit/finish because no Cover-state freeze exists.
- **Failure behavior:** true flag without file 400; missing Enrollment 404; DB/file failures can orphan or break objects.
- **Risk of change:** High—historical inputs and storage consistency.
- **Confidence:** Current behavior **Verified**; intended freeze policy **Unknown**.

### BR-09 — Evaluator references on Enrollment

- **Rule:** Enrollment creation derives Factory region, queries evaluators there, and stores the first Mental, DOH, and ODPC row.
- **Implementation:** `enrollService.create` at `src/service/enroll.ts:248-332`; `Evaluators`; seed data.
- **Inputs/conditions:** valid Factory/region and expected evaluator levels.
- **Result:** three evaluator foreign keys stored.
- **Edges/failure:** only a nonempty overall list is checked; a missing level can throw, and duplicates choose an arbitrary first row. The DB does not ensure referenced level/region. Review authorization does not use these IDs.
- **Failure behavior:** empty list 400; partial-level set likely unexpected 500.
- **Risk of change:** High—assignment and review ownership.
- **Confidence:** Code/seed **Verified**; live uniqueness **Unknown**.

### BR-10 — One Cover per Enrollment

- **Rule:** Factory needs a current-fiscal Enrollment. Create pre-checks no Cover and atomically inserts Cover plus initial `in_progress` CoverLog.
- **Implementation:** `coverService.create`; `Covers`, `CoverLogs`.
- **Inputs/conditions:** current Enrollment and no detected Cover.
- **Result:** new assessment.
- **Edges/failure:** no unique constraint and the check-then-insert races. Downstream code assumes at most one.
- **Failure behavior:** missing Enrollment 404; detected duplicate 400.
- **Risk of change:** Very high—identity/cardinality migration.
- **Confidence:** Application rule **Verified**; DB guarantee absent.

## Answers and evidence

### BR-11 — One Answer per Cover and Question

- **Rule:** Save rejects an existing Cover/Question pair and atomically creates Answer plus initial `in_review` AnswerLog.
- **Implementation:** `answerService.saveAnswer` at `src/service/answer.ts:14-212`; `Answers` schema.
- **Inputs/conditions:** Factory's current-fiscal Cover, existing Question, no detected pair.
- **Result:** persisted Answer and state event.
- **Edges/failure:** no unique constraint and no Cover-state guard. A missing Answer can be added while Cover is `in_review` or `finished`; concurrent duplicates are possible.
- **Failure behavior:** missing Cover/Question 404; detected duplicate 400.
- **Risk of change:** Very high—state and completeness integrity.
- **Confidence:** **Verified.**

### BR-12 — Standard Question auto-credit

- **Rule:** If any Question standard has a true Enrollment flag, choice is forced to `3`. Manual save/update/redo independently require (a) any relevant true flag and (b) any relevant certificate URL; current code does not require the URL to belong to the same standard whose flag is true. Submission auto-fill checks only for a relevant true flag and does not check certificate filenames.
- **Implementation:** `answer.ts:62-122,246-305,451-523,743-780,822-891`.
- **Inputs/conditions:** Question standards, matching Enrollment flag and filename.
- **Result:** choice `3` with `in_review`, or `recommended` on accept.
- **Edges/failure:** the independent `some()` checks can pair one standard's true flag with another relevant standard's URL. Submit can auto-credit without a certificate. Accepting an evaluator change-score on such an Answer ignores the proposed verdict and forces `3`, while returning “answer accepted.” This contradicts the negotiation prose. A later Enrollment standard change can diverge from the already-created Answer.
- **Failure behavior:** Answer evidence supplied 400; missing certificate 404.
- **Risk of change:** Very high—automatic score and consensus meaning.
- **Confidence:** **Verified.**

### BR-13 — Choice/evidence matrix

- **Rule:** Initial non-standard `0`/`n/a` stores no evidence. For `special=3`, choice 1/2/3 requires the corresponding row's `_1` file. For every other special value, choice 1 requires row 1, choice 2 rows 1+2, and choice 3 rows 1+2+3. Extra `_2/_3` files are optional.
- **Implementation:** `answer.ts:124-210,525-670,782-817,893-1035`; answer DTOs.
- **Inputs/conditions:** effective choice, Question `special`, new/existing PDF files.
- **Result:** validated filenames stored.
- **Edges/failure:** on initial `0`/`n/a`, supplied files pass DTO validation but are silently ignored. `special=3` edit/redo clears non-selected groups. Other specials preserve all old groups even on lowering and offer no explicit delete operation. For non-special `0`/`n/a`, update/redo may preserve or upload evidence although initial create ignores it. MinIO changes happen before DB commit.
- **Failure behavior:** missing required evidence 400.
- **Risk of change:** High—evidence retention and client uploads.
- **Confidence:** **Verified.**

### BR-14 — N/A choice

- **Rule:** `n/a` is accepted for every Question and is excluded from score numerator/denominator.
- **Implementation:** answer DTO unions; `choices` enum; `scoreHelpers.CHOICE_POINTS`.
- **Inputs/conditions:** `selectedChoice="n/a"`.
- **Result:** persisted Answer; zero contribution and no denominator count.
- **Edges/failure:** service never checks `Questions.choiceNA`, even though seed data exposes N/A only selectively. This is a deliberate code-authority contradiction to the apparent Question-option model.
- **Failure behavior:** none; any Question silently accepts N/A.
- **Risk of change:** Very high—existing validity and scores.
- **Confidence:** **Verified.**

### BR-15 — Factory edit and negotiation eligibility

- **Rule:** Generic update permits latest Answer state `in_review` or `rejected` and writes `in_review`. Negotiation requires Cover `in_progress` and Answer `rejected`: change-score may be accepted, any rejection may be redone, and hard reject cannot be accepted.
- **Implementation:** `answerService.update` at `answer.ts:396-672`; `negotiate` at `answer.ts:675-1037`.
- **Inputs/conditions:** own current-fiscal Cover/Question, latest states, action and evidence.
- **Result:** edit/redo changes Answer and appends `in_review`; accept changes `selectedChoice` and appends `recommended`.
- **Edges/failure:** generic update has no Cover-state check, so Factory can modify Answers during evaluator review or bypass negotiation before finalize. This contradicts `CONTEXT.md`'s no Factory/evaluator race claim. Recommended/finished are blocked.
- **Failure behavior:** invalid state/wrong negotiation Cover state 400; missing entity 404.
- **Risk of change:** Very high—workflow and concurrency compatibility.
- **Confidence:** **Verified.**

### BR-16 — Submission and re-submission

- **Rule:** Submit requires latest Cover `in_progress`, auto-fills standard matches, requires Answer count equal Question count, and requires no latest AnswerLog `rejected`; it then appends Cover `in_review`.
- **Implementation:** `answerService.submit` at `answer.ts:215-346`.
- **Inputs/conditions:** own current Cover, status, counts, latest logs.
- **Result:** Cover enters review.
- **Edges/failure:** count equality does not prove one Answer for every Question because duplicates are legal; duplicate-plus-missing can pass. Checks and CoverLog insert are not locked together against concurrent writers.
- **Failure behavior:** wrong status/incomplete/rejections 400; missing Cover 404.
- **Risk of change:** Very high—assessment completeness.
- **Confidence:** **Verified.**

## Review and finalization

### BR-17 — Reviewer region and category

- **Rule:** Mental owns Mental; DOH owns Disease/Safety; ODPC owns all five. Regional access uses current Factory region; Admin is national.
- **Implementation:** `evaluator.ts:CATEGORIES_FOR_LEVEL`; `evaluator-review.ts:assertCoverAccess/getAnswers/saveAnswerVerdict`.
- **Inputs/conditions:** reviewer level/region, Cover, Answer category.
- **Result:** scoped reads/writes; wrong category 403; wrong region 404.
- **Edges/failure:** no Cover-status or Enrollment-assignment-ID check. Tier-1 can act on a bounced `in_progress` Cover if Answer state permits. Factory relocation changes historical regional ownership.
- **Risk of change:** High—organizational authority.
- **Confidence:** **Verified.**

### BR-18 — Verdict shape and edit guard

- **Rule:** `approve` writes `recommended`; `change_score` requires a different `0`–`3` plus description and writes `rejected`; `reject` requires description and writes `rejected` with null verdict. Finished is immutable. Recommended is editable by its author or ODPC; rejected/in-review by any scoped reviewer.
- **Implementation:** `VerdictSaveBodySchema`; `evaluatorReviewService.saveAnswerVerdict`; save integration tests.
- **Inputs/conditions:** accessible Answer, category, latest state/author, valid decision.
- **Result:** exactly one AnswerLog; no file, CoverLog, or email side effect.
- **Edges/failure:** “different” compares against mutable `Answers.selectedChoice`. There is no Cover `in_review` gate despite the prose rule. `evaluation_id` is nullable/non-FK in the DB.
- **Failure behavior:** invalid payload/no-op/finished 400; scope/authorship 403; missing Answer-in-Cover 400.
- **Risk of change:** High—review history and resume behavior.
- **Confidence:** **Verified.**

### BR-19 — Finalize authorization and unresolved gate

- **Rule:** Only ODPC or Admin-as-ODPC may finalize. Regional ODPC needs region access. Any latest Answer state `in_review` blocks finalization.
- **Implementation:** `evaluatorReviewService.finalize` at `evaluator-review.ts:329-404`; finalize tests.
- **Inputs/conditions:** ODPC context, Cover access, latest AnswerLogs.
- **Result:** proceed only when every observed Answer is recommended, rejected, or already finished.
- **Edges/failure:** no latest Cover-status guard, idempotency key, row lock, version, or explicit nonempty/full-catalog gate. Concurrent/repeated finalizers can append duplicate promotions/transitions. This is non-idempotent despite ADR/CONTEXT race-free claims. Empty-Cover runtime behavior was not verified.
- **Failure behavior:** tier-1 403; wrong region/nonexistent Cover 404; unresolved Answer 400.
- **Risk of change:** Very high—finality and audit semantics.
- **Confidence:** Main behavior **Verified**; empty-Cover behavior **Unknown**.

### BR-20 — Finalize transition and rejected evidence

- **Rule:** Finalize promotes every `recommended` Answer to `finished`. Any rejected Answer produces Cover `in_progress`; otherwise Cover `finished`. It deletes and clears evidence for **all** rejected Answers, both hard reject and change-score.
- **Implementation:** `evaluator-review.ts:406-481`; ADR-0006; finalize tests.
- **Inputs/conditions:** resolved latest states and successful strict MinIO delete.
- **Result:** promotions, evidence-column clearing, and one CoverLog commit atomically in PostgreSQL.
- **Edges/failure:** older `CONTEXT.md`/ADR-0005 passages say change-score evidence is preserved; code and ADR-0006 are authoritative. MinIO success followed by DB failure leaves DB references to deleted objects. Repeated finalize appends another CoverLog.
- **Failure behavior:** MinIO failure returns 500 before DB writes; later DB failure is not compensated.
- **Risk of change:** Very high—irreversible evidence and finality.
- **Confidence:** **Verified.**

### BR-21 — Change-score acceptance and live choice

- **Rule:** Factory acceptance copies the proposed verdict into `Answers.selectedChoice` and writes a new `recommended` log. Redo writes the Factory's new choice and `in_review`. The loop has no limit.
- **Implementation:** `answerService.negotiate`; `scoreService` reads `Answers.selectedChoice` only.
- **Inputs/conditions:** Cover `in_progress`, Answer `rejected`, action and evidence.
- **Result:** provisional settlement or another review round.
- **Edges/failure:** this overwrites the Factory's original claim, contrary to `CONTEXT.md` and ADR-0004. The recommended log drops verdict/description/accepting actor, so acceptance is inferred from history. Matching Standard Question acceptance forces `3` instead of the verdict. There is no deadline/escalation cap.
- **Failure behavior:** hard-reject accept or unsupported evidence 400.
- **Risk of change:** Very high—score meaning, provenance, and existing data.
- **Confidence:** **Verified.**

## Score, Grade, and notification

### BR-22 — Score calculation and availability

- **Rule:** Points are 3/2/1/0; N/A is excluded. Percentage is `Math.round(achieved / (3 × scoredCount) × 100)`. Total combines raw Answers, not category percentages. Score is available for `in_review` and `finished`; list endpoints omit `in_progress`.
- **Implementation:** `scoreHelpers.CHOICE_POINTS/scoreGroup/calculateBreakdown`; `scoreService`; ADR-0001; score tests.
- **Inputs/conditions:** current-fiscal accessible Cover and current `Answers.selectedChoice` rows.
- **Result:** on-demand nested Score Report; grade null unless finished.
- **Edges/failure:** all-N/A/empty group returns zeros. AnswerLogs are not consulted. No completeness gate exists beyond Cover status, and rule changes retroactively rescore history.
- **Failure behavior:** own missing Cover 404; own in-progress Cover 400; list path silently omits non-ready Covers.
- **Risk of change:** Very high—published and historical results.
- **Confidence:** **Verified.**

### BR-23 — Grade tiers

- **Rule:** Evaluate top-down: gold when every category is >80, total ≥90, and every `special > 0` Answer is `3`; silver when every category is >60 and total ≥80; certificate when total ≥60; otherwise joined. Grade exists only for finished Covers.
- **Implementation:** `scoreHelpers.computeGrade`; `scoreService`; `evaluatorReviewService.finalize`.
- **Inputs/conditions:** rounded score groups and current choices.
- **Result:** one on-demand award tier.
- **Edges/failure:** code's gold gate includes `special=2`; `CONTEXT.md` says only 1 or 3. Code is authoritative. Empty categories score 0 and prevent gold/silver. Direct grade boundary/special tests are absent.
- **Failure behavior:** no explicit error; a prose-based implementation would silently award a different grade.
- **Risk of change:** Very high—award eligibility and prior reports.
- **Confidence:** **Verified.**

### BR-24 — Finalize email

- **Rule:** After commit, finalize queues one result email when `Enrollment.safetyOfficerEmail` exists: finished includes Grade; in-progress requests revision. Queue failure is logged and swallowed.
- **Implementation:** `evaluator-review.ts:341-351,493-510`; email queue/worker; finalize tests.
- **Inputs/conditions:** successful finalize and non-null contact email.
- **Result:** BullMQ job; API success does not guarantee delivery.
- **Edges/failure:** `CONTEXT.md` calls the field `enrolls.email` and says every finalize emails; actual optional field is `safetyOfficerEmail`, so missing email skips notification. Create does not validate its format. Non-idempotent repeated finalize may email repeatedly.
- **Failure behavior:** queue failure still returns finalize success.
- **Risk of change:** Medium/high—notification expectations.
- **Confidence:** **Verified.**

## Consistency and audit

### BR-25 — Latest-log-wins state

- **Rule:** Current Cover/Answer state is the event with greatest serial ID; timestamps are informational.
- **Implementation:** queries using `orderBy(desc(id))` or `selectDistinctOn`; `CoverLogs`, `AnswerLogs`.
- **Inputs/conditions:** append-only log rows.
- **Result:** deterministic current state under serial-ID order.
- **Edges/failure:** illegal/concurrent transitions remain legal writes; latest may simply be the last race winner. Actor IDs are nullable/non-FK.
- **Risk of change:** Very high—every state query and history.
- **Confidence:** **Verified.**

### BR-26 — Cross-store consistency

- **Rule:** Entity+log pairs and finalize DB changes use PostgreSQL transactions. MinIO I/O occurs outside transactions; finalize email queues after commit.
- **Implementation:** Factory/Cover/Answer/Enrollment/Evaluator Review services; `utilities.uploadFile/deleteFile/deleteFileStrict`.
- **Inputs/conditions:** object I/O plus DB mutation.
- **Result:** local DB atomicity, not distributed atomicity.
- **Edges/failure:** failed DB after upload leaves orphans; delete-before-update may break references; finalize delete-before-transaction can lose evidence on DB failure. There is no outbox, compensation, reconciliation, lock, version, or idempotency key.
- **Risk of change:** High—architectural and operational migration.
- **Confidence:** **Verified.**

### BR-27 — Application-only invariants

- **Rule:** Services attempt to enforce one Enrollment/year, one Cover/Enrollment, one Answer/Cover/Question, evaluator selection, evidence rules, and transition conventions.
- **Implementation:** service pre-checks; `src/drizzle/schema.ts`.
- **Inputs/conditions:** normal single-request service paths.
- **Result:** happy-path data usually follows domain expectations.
- **Edges/failure:** the DB lacks corresponding uniqueness and checks for evaluator correctness, subtype exclusivity, location hierarchy, nonnegative workforce, N/A eligibility, flag/file parity, legal transitions, and actor references. Default isolation does not protect check-then-write races.
- **Risk of change:** Very high—constraints require live-data audit and conflict handling.
- **Confidence:** Repository schema **Verified**; live violations **Unknown**. See [database](database.md) and [technical debt](technical-debt.md).

## Provincial read-only review

### BR-28 — Provincial Officer cover-review status gate and verdict redaction

- **Rule:** A Provincial Officer may open a Cover in their own province only when its latest status is `in_review` or `finished`; an `in_progress` Cover returns the same 404 as an out-of-province Cover. While `in_review`, every Answer's latest verdict choice and description are forced `null` and its per-Answer status is forced `in_review`, regardless of the underlying record. Once `finished`, the Officer sees the same verdict values an Evaluator sees. Standard certificates are unredacted at both statuses.
- **Implementation:** `evaluator-review.ts:getAnswers`, gated on `ReviewerScope.kind === "province"`; `resolveProvincialOfficer` (level `ODPC`, so all five `QuestionCategory` values are in scope); `latestCoverLogFor` for the status gate; `src/routes/provincialOfficers/covers/[coverId]/answers/index.ts`.
- **Inputs/conditions:** province-scoped reviewer context, Cover's latest `coverLogs` status.
- **Result:** same response shape as the Evaluator/DOED cover-review read (`AnswerViewSchema`), with verdict fields nulled and status pinned while `in_review`.
- **Edges/failure:** the redaction and status gate apply only to the province scope — Evaluator and DOED reads of the same Cover are unaffected. The Officer has no write path: verdict-save and finalize routes are not exposed under `provincialOfficers/**`.
- **Failure behavior:** `in_progress` or out-of-province Cover → `404 { message: "cover not found" }`.
- **Risk of change:** High—confidentiality of an open review and authorization scope.
- **Confidence:** **Verified.**

## Coverage and known gaps

Current tests cover OTP flows, score arithmetic/report shape, Enrollment Cover-status filters, evaluator region/category reads, verdict payload/authorship behavior, finalize authorization/gates/outcomes, rejected evidence deletion, MinIO abort, DB finalize transaction, and email-job selection.

Important rules without direct coverage include fiscal boundary/timezone, cardinality concurrency, Factory writes by Cover state, accepted-verdict provenance, Standard Question acceptance, N/A eligibility, workforce nonnegativity, false-standard-with-file, full Question set equality, repeat/concurrent finalize, empty Cover finalize, Grade special/boundary cases, presigned-file ownership, and refresh-token expiry verification. Evaluator and Provincial Officer detail-read region/province scoping (BR-05) and the provincial cover-review status gate/redaction (BR-28) gained integration coverage 2026-09-03.
