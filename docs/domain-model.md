# Domain Model

This document describes the domain as the application behaves today. Where `CONTEXT.md` or an ADR disagrees with executable code, current code is authoritative and the contradiction is called out explicitly.

Related references: [business rules](business-rules.md), [database](database.md), [authentication and authorization](authentication-authorization.md), [API](api/API.md), [architecture](architecture.md), and [technical debt](technical-debt.md).

## Domain boundary

TWHP manages an annual workplace health, safety, and wellbeing assessment. A Factory registers, is validated by DOED, enrolls for the current fiscal year, creates a Cover, answers the Question catalogue with evidence, and submits it for hierarchical review. Mental and DOH evaluators review category subsets; ODPC, or a DOED admin acting as national ODPC, finalizes the Cover. Provincial Officers observe factories, enrollments, and scores in their province.

PostgreSQL owns durable identities, enrollments, assessments, and append-only state logs. Redis owns transient authentication challenges and queue state. MinIO owns evidence objects; PostgreSQL stores their filenames. See [database](database.md) for persistence details.

The repository contains one bounded context. The Cover is the central aggregate-like unit, but its invariants are distributed across services and are not protected by one database constraint or concurrency boundary. **Confidence: Inferred.**

## Actors and authority

| Actor | Scope | Current authority | Evidence |
|---|---|---|---|
| Factory | Its own current-fiscal participation | Register; log in after validation; create/update Enrollment; create Cover; save/edit/negotiate/submit Answers; read own score | `factoryGuard`; `src/routes/factories/**`; `factoryService`, `enrollService`, `answerService`, `scoreService` |
| Provincial Officer | One province | Read province-scoped Factory, Enrollment, and Score lists; read one Enrollment or Factory by id; read a Cover's Answers (open only while `in_review`/`finished`, verdicts redacted while `in_review`); first-login password/email change. No write path. | `officerGuard`; `src/routes/provincialOfficers/**`; `evaluator-review.ts:resolveProvincialOfficer` (province-scoped `ReviewerScope`) |
| Mental Evaluator | One health region | Read and judge Mental-category Answers on Covers in that region; approvals are provisional | `CATEGORIES_FOR_LEVEL`; `assertCoverInRegion`; `saveAnswerVerdict` |
| DOH Evaluator | One health region | Read and judge Disease/Safety Answers on Covers in that region; approvals are provisional | Same symbols |
| ODPC Evaluator | One health region | Read/judge all categories, override any non-finished Answer, and finalize Covers in that region | `categoriesFor("ODPC")`; `finalize` |
| DOED Admin | National | Validate/edit/delete factories; read national data; review all categories and finalize as national ODPC | `adminGuard`; `adminReviewerContext`; admin routes |
| Safety Officer | Contact inside an Enrollment, not an Account | Receives a finalize result/revision email when `safetyOfficerEmail` is present | `Enrolls.safety_officer_*`; `evaluator-review.ts:341-351,493-507` |

The three evaluator IDs stored on an Enrollment are not authorization boundaries. Review authorization compares evaluator level and current Factory region, not the caller against `evalMentalId`, `evalDohId`, or `evalOdpcId`. Therefore an “assigned evaluator” and an “eligible regional evaluator” are different concepts in current code. **Confidence: Verified.**

## Ubiquitous language

| Term | Meaning in current code |
|---|---|
| Account | Login identity with unique username/email, password, role, and one refresh-token hash. Exactly one matching subtype is intended but not database-enforced. |
| Staff Account | DOED, Evaluator, or Provincial Account. It normally uses email OTP after password verification. |
| Factory | External workplace Account subtype. It must be validated to log in. |
| Enrollment | Annual participation data: workforce counts, declared standards and certificates, safety-officer contact, and three evaluator references. |
| Fiscal Year | Half-open interval from October 1 00:00 to the next October 1 00:00, calculated using the application host's local timezone. |
| Cover | One assessment instance and the unit of scoring. Its current state is the latest CoverLog. |
| CoverLog | Append-only Cover state event. Greatest serial `id` wins; timestamp is informational. |
| Question | Seeded assessment item with one category, choice text, optional N/A text, standards, and integer `special`. |
| Standard Question | Question linked to one or more standards. A matching claimed standard forces the Answer to choice `3`. |
| Answer | Current persisted response to one Question on one Cover, including `selectedChoice` and nine evidence slots. |
| AnswerLog | Append-only Answer state/verdict event. Greatest serial `id` wins. |
| Verdict | Per-Answer evaluator decision: `approve`, `change_score`, or `reject`. |
| Verdict Score | Proposed `0`–`3` replacement stored on a rejected AnswerLog. `n/a` is excluded at the verdict API boundary. |
| Live Choice | The value used by Score and Grade. In current code this is simply `Answers.selectedChoice`. |
| Evidence | PDF up to 10 MB stored in MinIO; the Answer or Enrollment stores only its filename. |
| Score | Rounded, on-demand percentage calculated from current Answer choices; never persisted. |
| Grade | On-demand finished-Cover award: `gold`, `silver`, `certificate`, or `joined`. |
| 2FA Challenge | Redis-only pending staff login containing account ID, hashed OTP, and attempts. |

## Entities and relationships

```text
Account ── intended exactly one subtype ── Factory | Evaluator | ProvincialOfficer | AdminDoed
Factory ── intended one Enrollment per Fiscal Year
Enrollment ── intended zero or one Cover
Enrollment ── stores Mental, DOH, and ODPC evaluator references
Cover ── CoverLog history; latest ID is current Cover state
Cover ── intended one Answer per Question
Question ── one Category; zero or more Standards
Answer ── AnswerLog history; latest ID is current Answer state
```

Only the foreign-key portions are database-enforced. The following cardinalities are application-only and race-prone:

- one Enrollment per Factory per fiscal year;
- one Cover per Enrollment;
- one Answer per Cover and Question;
- one evaluator of each level per region;
- one Account subtype matching its role.

See [database](database.md) and [technical debt](technical-debt.md).

## State model

### Cover states

| State | Meaning | Current writers |
|---|---|---|
| `in_progress` | Factory can prepare or revise the assessment | Cover creation; finalize when at least one Answer is rejected |
| `in_review` | Submitted for evaluator review | Factory submission/re-submission |
| `finished` | Finalized without any rejected Answer | ODPC/admin finalize |

Current state is always the latest CoverLog by serial ID. Code contains no transition matrix, Cover row lock, version, or already-finalized guard.

### Answer states

| State | Meaning | Current writers |
|---|---|---|
| `in_review` | Awaiting a verdict | Initial save/standard auto-fill; Factory edit/redo |
| `recommended` | Provisionally settled and ODPC-overridable | Every reviewer approval; Factory acceptance of change-score |
| `rejected` | Returned for Factory action | Reviewer `change_score` or hard `reject` |
| `finished` | Final and immutable through service guards | Finalize promotion only |

A rejected Answer with non-null `verdictChoice` is a change-score proposal. A rejected Answer with null `verdictChoice` is a hard reject.

## Main workflows

### Registration and authentication

1. Anyone registers a Factory Account and Factory subtype; location is derived from `subdistrictId`.
2. DOED validates the Factory.
3. Unvalidated Factories cannot log in. Validation is not rechecked on every authenticated request.
4. Staff normally complete password then email OTP. Evaluator and Provincial first-login accounts bypass OTP until they replace their password/email. A guarded development header can also bypass OTP; see [authentication and authorization](authentication-authorization.md).

### Annual enrollment and assessment

1. Factory creates an Enrollment for the application-calculated current fiscal year.
2. Service derives Factory region, chooses the first evaluator found at each level, uploads standard certificates, and inserts the Enrollment.
3. Factory creates a Cover and initial `in_progress` CoverLog.
4. Factory saves Answers. A matching standard forces choice `3`; otherwise evidence is validated by choice and Question `special`.
5. Submit requires Cover `in_progress`, auto-fills unanswered matching-standard Questions, compares Answer count with Question count, rejects if a latest AnswerLog remains `rejected`, and appends Cover `in_review`.

### Hierarchical review and negotiation

1. Mental, DOH, and ODPC save verdicts one Answer at a time. A save appends one AnswerLog and does not transition the Cover, touch MinIO, or send email.
2. Finalize is ODPC/admin-only and refuses if any Answer remains `in_review`.
3. Finalize promotes `recommended` Answers to `finished`, deletes and clears evidence for every rejected Answer, and appends Cover `finished` when none are rejected or `in_progress` otherwise.
4. On a bounced Cover, Factory accepts a change-score or redoes the Answer. A hard reject cannot be accepted.
5. Factory re-submits after no rejected Answer remains. The loop is unbounded.

## Code-authority contradictions

These are not alternative interpretations; the left side is current behavior.

| Current code authority | Contradicting prose |
|---|---|
| Factory acceptance overwrites `Answers.selectedChoice`; Score reads that column only (`answer.ts:769-815`, `score.ts`). | `CONTEXT.md` and ADR-0004 say the Factory claim is never overwritten and accepted verdict is reconstructed separately. |
| Accepting an evaluator verdict on a matching Standard Question forces choice `3`, regardless of the verdict (`answer.ts:743-778`). | The negotiation prose describes accepting the proposed verdict choice. |
| Gold requires full score on every `special > 0` Question (`scoreHelpers.ts:61-63`). | `CONTEXT.md` says only `special` 1 or 3. |
| Factory answer create/update and evaluator verdict save lack a Cover-state guard. | `CONTEXT.md` says Factory and evaluators do not hold/write the Cover concurrently and tier-1 edits only while Cover is `in_review`. |
| Finalize has no already-finished, idempotency, version, or locking guard. | ADR/CONTEXT prose claims there is no Cover-status race. |
| `n/a` is accepted for every Question. | Question data exposes an N/A option only selectively. |
| Cardinalities are service pre-checks, not database guarantees. | Domain prose commonly states them as unconditional “one” relationships. |
| Fiscal timezone behavior at the database boundary is unknown. | Domain prose treats the Oct-1 boundary as unambiguous. |
| Finalize deletes evidence for all rejected Answers, including change-score (`evaluator-review.ts:417-448`, ADR-0006). | Older `CONTEXT.md` and ADR-0005 passages say change-score evidence is preserved. |

Detailed inputs, failures, edge cases, and change risks are in [business rules](business-rules.md).

